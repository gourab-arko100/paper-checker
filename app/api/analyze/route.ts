import { exclusionSchema } from "@/lib/detection-scope";
import { browserPassages, detectionErrors, detectorVariant } from "@/lib/browser-detection";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  databaseConfigured,
  ensureUser,
  sameOrigin,
  session,
} from "@/lib/auth";
import { assess, ProviderError, setting, type Usage } from "@/lib/providers";
import { metadataWriting, type Scan } from "@/lib/results";
import {
  claimScan,
  finalizeQuota,
  finishScan,
  reserveQuota,
  saveBrowserDetection,
} from "@/lib/analysis-store";
import { words } from "@/lib/text";

export const maxDuration = 60;
const input = z.object({
  text: z
    .string()
    .max(2_000_000)
    .refine((value) => words(value) > 0),
  name: z.string().trim().min(1).max(255),
  type: z.enum(["pdf", "docx", "txt", "paste"]),
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  pages: z.number().int().min(1).max(100000).optional(),
  consent: z.literal(true),
  retry: z.string().uuid().optional(),
});
const error = (message: string, status: number) =>
  Response.json({ error: message }, { status });
async function boundedJson(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Document input is missing.");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0,
    result = "";
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > 4_000_000) {
      await reader.cancel();
      throw new Error(
        "Document text exceeds the 4 MB analysis request capacity.",
      );
    }
    result += decoder.decode(part.value, { stream: true });
  }
  return JSON.parse(result + decoder.decode()) as unknown;
}

async function analyze(
  request: Request,
  user: NonNullable<Awaited<ReturnType<typeof session>>>,
  progress: (stage: string) => void,
) {
  let raw: unknown;
  try {
    raw = await boundedJson(request);
  } catch {
    return error(
      "The document request is invalid or exceeds the 4 MB text capacity.",
      400,
    );
  }
  const decoded = input.safeParse(raw);
  if (!decoded.success)
    return error(
      "Provide readable document text and confirm provider processing.",
      400,
    );
  const data = decoded.data;
  const textHash = createHash("sha256").update(data.text).digest("hex");
  if (data.type === "paste" && data.hash !== textHash)
    return error("Document validation failed.", 400);
  const start = Date.now();
  const lease = new Date(start + 120000).toISOString();
  try {
    await ensureUser(user.id);
    const claim = await claimScan(
      user.id,
      {
        document_name: data.name,
        document_type: data.type,
        document_hash: data.hash,
        text_hash: textHash,
        word_count: words(data.text),
        character_count: data.text.length,
        page_count: data.pages,
      },
      lease,
      data.retry,
    );
    if (claim.status === "missing")
      return error(
        "Reopen the matching original document to retry this scan.",
        404,
      );
    if (claim.status === "busy")
      return error(
        "An analysis is already in progress or requests arrived too quickly. Check history in a moment.",
        409,
      );
    const { scan, retainedWriting } = claim;
    if (claim.status === "cached")
      return Response.json({
        scan: { ...scan, writing: retainedWriting ?? scan.writing },
      });
    const runWriting = async () => {
      progress("Evaluating writing quality");
      let reservation: string | null = null;
      const usage: Usage = { requests: 0, characters: 0 };
      let status = "failed";
      try {
        if (!process.env.GEMINI_API_KEY)
          throw new ProviderError("Gemini is awaiting configuration.");
        reservation = await reserveQuota(user.id, scan.id, lease, {
          provider: "gemini",
          characters: data.text.length,
          requests: 1,
          daily: null,
          monthly: null,
          dailyRequests: setting("GEMINI_DAILY_REQUEST_LIMIT"),
        }).catch(() => {
          throw new ProviderError(
            "Provider quota could not be reserved. Try again shortly.",
          );
        });
        if (!reservation)
          throw new ProviderError(
            "The configured provider quota is exhausted. Try again after the UTC reset.",
          );
        const value = await assess(data.text, usage);
        status = "success";
        return { value, message: null };
      } catch (cause) {
        return {
          value: null,
          message:
            cause instanceof ProviderError
              ? cause.message
              : "The provider timed out or became unavailable. You can retry this analysis.",
        };
      } finally {
        if (reservation) {
          const inputRate = Number(
            process.env.GEMINI_INPUT_USD_PER_MILLION?.trim() || Number.NaN,
          );
          const outputRate = Number(
            process.env.GEMINI_OUTPUT_USD_PER_MILLION?.trim() || Number.NaN,
          );
          const cost =
            ((usage.input ?? 0) * inputRate +
              (usage.output ?? 0) * outputRate) /
            1e6;
          await finalizeQuota(user.id, reservation, {
            request_status: status === "success" ? "success" : "failed",
            attempted_requests: usage.requests,
            charged_characters: usage.characters,
            input_tokens: usage.input,
            output_tokens: usage.output,
            estimated_cost: Number.isFinite(cost) && cost >= 0 ? cost : null,
          }).catch(() => {
            // Keep the original, conservative reservation when accounting cannot be finalized.
            console.error(
              "A provider quota reservation could not be finalized.",
            );
          });
        }
      }
    };
    const existingWriting = retainedWriting ?? scan.writing;
    const writing = existingWriting
      ? { value: existingWriting, message: null }
      : await runWriting();
    const ai = {
      value: scan.ai,
      message: scan.ai
        ? null
        : "Browser detection has not finished. Retry if it was interrupted.",
    };
    progress("Generating report");
    const complete = {
      ...scan,
      ai: ai.value,
      writing: writing.value,
      ai_score: ai.value?.score ?? null,
      writing_score: writing.value?.score ?? null,
      ai_error: ai.message,
      writing_error: writing.message,
      processing_duration: Date.now() - start,
      status:
        ai.value && writing.value
          ? "complete"
          : ai.value || writing.value
            ? "partial"
            : "failed",
    } satisfies Scan;
    const summary = { ...complete, writing: metadataWriting(complete.writing) };
    progress("Saving analysis");
    const saved = await finishScan(user.id, summary, lease, {
      text: data.text,
      ai: complete.ai,
      writing: complete.writing,
    }).catch(() => false);
    if (!saved)
      return Response.json({
        scan: complete,
        warning:
          "Analysis completed, but history could not be updated. Download the report before leaving.",
      });
    return Response.json({
      scan: {
        ...complete,
        processing_duration:
          scan.processing_duration + complete.processing_duration,
      },
    });
  } catch {
    return error(
      "The workspace could not save this analysis. Please try again shortly.",
      503,
    );
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return error("Request origin was rejected.", 403);
  const user = await session();
  if (!user) return error("Sign in to analyze a document.", 401);
  if (!databaseConfigured())
    return error("The workspace database is awaiting configuration.", 503);
  if (request.headers.get("accept") !== "application/x-ndjson")
    return analyze(request, user, () => {});
  const encoder = new TextEncoder();
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (value: unknown) => {
        if (!cancelled)
          controller.enqueue(encoder.encode(JSON.stringify(value) + "\n"));
      };
      try {
        const result = await analyze(request, user, (stage) => send({ stage }));
        send({ done: true, status: result.status, data: await result.json() });
      } catch {
        send({
          done: true,
          status: 503,
          data: { error: "Analysis is temporarily unavailable." },
        });
      } finally {
        if (!cancelled) controller.close();
      }
    },
    cancel() {
      cancelled = true;
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "private, no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

const browserInput = z.object({
  scanId: z.uuid(),
  textHash: z.string().regex(/^[a-f0-9]{64}$/),
  result: z.union([
    z.object({
      detector: detectorVariant.default("tmr"),
      passages: browserPassages,
      exclusions: z.array(exclusionSchema).max(20_000),
    }),
    z.object({
      error: z.enum(
        Object.keys(detectionErrors) as [
          keyof typeof detectionErrors,
          ...(keyof typeof detectionErrors)[],
        ],
      ),
    }),
  ]),
});
export async function PATCH(request: Request) {
  if (!sameOrigin(request)) return error("Request origin was rejected.", 403);
  const user = await session();
  if (!user) return error("Sign in to save browser detection.", 401);
  if (!databaseConfigured())
    return error("The workspace database is awaiting configuration.", 503);
  const parsed = browserInput.safeParse(
    await boundedJson(request).catch(() => null),
  );
  if (!parsed.success) return error("The browser result was invalid.", 400);
  const { scanId, textHash, result } = parsed.data;
  try {
    const saved = await saveBrowserDetection(user.id, scanId, textHash, result);
    if (!saved) return error("The matching scan was not ready to save.", 409);
    return Response.json(saved);
  } catch {
    return error("Browser detection could not be saved.", 503);
  }
}
