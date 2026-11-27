import { z } from "zod";
import { includedRanges, type Exclusion } from "./detection-scope";

export const desklibModel = "desklib/ai-text-detector-v1.01";
export const desklibExport = "ns1703/desklib-ai-text-detector-onnx";
export const desklibRevision = "c70d913faedf75bd47f0dca342f43f1165ee9595";
export const desklibThreshold = 0.15;
export const detectorVariant = z.enum(["desklib", "tmr"]);
export type DetectorVariant = z.infer<typeof detectorVariant>;

export function desklibProbabilities(logits: number[]) {
  if (logits.length !== 1 || !Number.isFinite(logits[0]))
    throw new Error("Unexpected Desklib output.");
  const ai = 1 / (1 + Math.exp(-logits[0]));
  return { human: 1 - ai, ai };
}

export const detectorModel = "onnx-community/tmr-ai-text-detector-ONNX";
export const detectorRevision = "b9aa251e5bcda7e429fcc936767d921435945b60";
export const detectorTokenLimit = 512;
export const detectionErrors = {
  no_prose:
    "No eligible prose remained after excluding identified front matter and references.",
  cancelled: "Browser detection was cancelled. Retry it from this report.",
  unsupported:
    "Browser detection requires a browser with Web Workers and WebAssembly support.",
  storage:
    "Desklib could not be saved in browser storage. Free up space or try another browser. Gemini writing analysis remains available.",
  mobile_deferred:
    "On-device AI detection was deferred. Use Retry failed analysis to start it. The first run downloads about 485 MB.",
  low_memory:
    "This device may not have enough memory for Desklib. You can still use Gemini writing analysis.",
  unavailable:
    "The local model could not load or run. Check browser support, memory, and access to the model files, then retry.",
} as const;
export type DetectionError = keyof typeof detectionErrors;
export const browserPassages = z
  .array(
    z.object({
      start: z.number().int().nonnegative(),
      end: z.number().int().positive(),
      score: z.number().finite().min(0).max(1),
    }),
  )
  .min(1)
  .max(20_000);
export type BrowserPassage = z.infer<typeof browserPassages>[number];

export function browserResult(
  passages: BrowserPassage[],
  length: number,
  exclusions: Exclusion[] = [],
  detector: DetectorVariant = "desklib",
) {
  const ranges = includedRanges(length, exclusions);
  if (!ranges?.length) return null;
  let index = 0;
  let weighted = 0;
  let eligible = 0;
  for (const range of ranges) {
    let end = range.start;
    while (end < range.end) {
      const item = passages[index++];
      if (
        !item ||
        item.start !== end ||
        item.end <= end ||
        item.end > range.end
      )
        return null;
      weighted += (item.end - item.start) * item.score;
      end = item.end;
    }
    eligible += range.end - range.start;
  }
  if (!eligible || index !== passages.length) return null;
  return {
    source: "browser" as const,
    method: "body-prose-v1" as const,
    model: detector === "desklib" ? desklibModel : detectorModel,
    revision: detector === "desklib" ? desklibRevision : detectorRevision,
    score: weighted / eligible,
    parts: passages.length,
    lowConfidence: false,
    passages,
    exclusions,
    eligible,
  };
}

export function nextPassage(
  text: string,
  start: number,
  countTokens: (text: string) => number,
) {
  const boundary = (end: number) =>
    /[\uDC00-\uDFFF]/.test(text.charAt(end)) ? end - 1 : end;
  let end = boundary(Math.min(text.length, start + 4096));
  if (countTokens(text.slice(start, end)) > detectorTokenLimit) {
    let low = start + 1;
    let high = end;
    end = start;
    while (low <= high) {
      const middle = Math.floor((high + low) / 2);
      const candidate = boundary(middle);
      if (countTokens(text.slice(start, candidate)) <= detectorTokenLimit) {
        end = Math.max(end, candidate);
        low = middle + 1;
      } else high = middle - 1;
    }
  }
  if (end <= start)
    throw new Error("The tokenizer could not split the document.");
  if (end < text.length) {
    const tailStart = start + Math.floor((end - start) * 0.75);
    const tail = text.slice(tailStart, end);
    const breaks = [...tail.matchAll(/(?:[.!?]\s+|\r?\n+|\s+)/g)];
    for (const match of breaks.reverse()) {
      const split = tailStart + match.index + match[0].length;
      if (countTokens(text.slice(start, split)) <= detectorTokenLimit)
        return split;
    }
  }
  return end;
}

export type DetectionProgress = { kind: "progress"; message: string };
export type Diagnostics = {
  labels: Record<string, string>;
  device: "webgpu" | "wasm";
  dtype: "q4" | "q8" | "fp32";
  raw: { logits: number[]; human: number; ai: number; tokens: number }[];
};
export type DiagnosticMode = "auto" | "tmr-q8" | "tmr-q4" | "tmr-fp32";
export type BrowserDetection = {
  detector: DetectorVariant;
  passages: BrowserPassage[];
  exclusions: Exclusion[];
};
export type DetectionReply =
  | DetectionProgress
  | ({ kind: "success"; diagnostic?: Diagnostics } & BrowserDetection)
  | { kind: "error"; code: DetectionError };
