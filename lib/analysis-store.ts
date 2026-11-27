import { and, eq, inArray, or, sql } from "drizzle-orm";
import { withOwner } from "./db";
import { apiUsage, retained, scans } from "./schema";
import {
  browserResult,
  detectionErrors,
  type BrowserDetection,
  type DetectionError,
} from "./browser-detection";
import { needsBrowserDetection, type Scan } from "./results";
import { normalizeDate } from "./workspace";

type ScanInput = Pick<
  typeof scans.$inferInsert,
  | "document_name"
  | "document_type"
  | "document_hash"
  | "text_hash"
  | "word_count"
  | "character_count"
  | "page_count"
>;
type Claim =
  | { status: "ready" | "cached"; scan: Scan; retainedWriting: Scan["writing"] }
  | { status: "missing" }
  | { status: "busy" };

export async function claimScan(
  owner: string,
  input: ScanInput,
  lease: string,
  retry?: string,
): Promise<Claim> {
  try {
    return await withOwner(owner, async (db): Promise<Claim> => {
      const [previous] = await db
        .select()
        .from(scans)
        .where(
          and(
            eq(scans.user_id, owner),
            eq(scans.document_hash, input.document_hash),
            eq(scans.text_hash, input.text_hash),
          ),
        );
      if (retry && previous?.id !== retry) return { status: "missing" };
      if (!previous) {
        const [created] = await db
          .insert(scans)
          .values({
            ...input,
            user_id: owner,
            active_until: lease,
          })
          .returning();
        return {
          status: "ready",
          scan: normalizeDate(created),
          retainedWriting: null,
        };
      }
      const cached =
        previous.status === "complete" ||
        (!retry && previous.status !== "processing");
      let scan = previous;
      if (!cached) {
        const [claimed] = await db
          .update(scans)
          .set({ status: "processing", active_until: lease })
          .where(
            and(
              eq(scans.id, previous.id),
              eq(scans.user_id, owner),
              or(
                inArray(scans.status, ["partial", "failed"]),
                and(
                  eq(scans.status, "processing"),
                  sql`${scans.active_until} <= now()`,
                ),
              ),
            ),
          )
          .returning();
        if (!claimed) return { status: "busy" };
        scan = claimed;
      }
      const [detail] = await db
        .select({ writing: retained.writing })
        .from(retained)
        .innerJoin(scans, eq(scans.id, retained.scan_id))
        .where(and(eq(retained.scan_id, scan.id), eq(scans.user_id, owner)));
      return {
        status: cached ? "cached" : "ready",
        scan: normalizeDate(scan),
        retainedWriting: detail?.writing ?? null,
      };
    });
  } catch (error) {
    const databaseError =
      error instanceof Error && error.cause ? error.cause : error;
    if (
      databaseError &&
      typeof databaseError === "object" &&
      "code" in databaseError &&
      (databaseError.code === "23505" || databaseError.code === "P0001")
    ) {
      return { status: "busy" };
    }
    throw error;
  }
}

type Quota = {
  provider: "gemini";
  characters: number;
  requests: number;
  daily: number | null;
  monthly: number | null;
  dailyRequests: number | null;
};

export async function reserveQuota(
  owner: string,
  scan: string,
  lease: string,
  quota: Quota,
) {
  const result = await withOwner(owner, (db) =>
    db.execute<{ id: string | null }>(sql`
    select public.reserve_quota(${owner}, ${scan}::uuid, ${lease}::timestamptz,
      ${quota.provider}, ${quota.characters}::integer, ${quota.requests}::integer,
      ${quota.daily}::bigint, ${quota.monthly}::bigint, ${quota.dailyRequests}::bigint) as id`),
  );
  return result.rows[0].id;
}

type UsageUpdate = Pick<
  typeof apiUsage.$inferInsert,
  | "request_status"
  | "attempted_requests"
  | "charged_characters"
  | "input_tokens"
  | "output_tokens"
  | "estimated_cost"
>;
export async function finalizeQuota(
  owner: string,
  reservation: string,
  usage: UsageUpdate,
) {
  await withOwner(owner, (db) =>
    db
      .update(apiUsage)
      .set(usage)
      .where(
        and(
          eq(apiUsage.id, reservation),
          eq(apiUsage.user_id, owner),
          eq(apiUsage.request_status, "reserved"),
        ),
      ),
  );
}

export async function finishScan(
  owner: string,
  scan: Scan,
  lease: string,
  detail: { text: string; ai: Scan["ai"]; writing: Scan["writing"] },
) {
  const result = await withOwner(owner, (db) =>
    db.execute<{ saved: boolean }>(sql`
    select public.finish_scan(${owner}, ${scan.id}::uuid, ${lease}::timestamptz,
      ${JSON.stringify(scan)}::jsonb, ${JSON.stringify(detail)}::jsonb) as saved`),
  );
  return result.rows[0].saved;
}

export function saveBrowserDetection(
  owner: string,
  id: string,
  hash: string,
  result: BrowserDetection | { error: DetectionError },
) {
  return withOwner(owner, async (db) => {
    const filter = and(
      eq(scans.id, id),
      eq(scans.user_id, owner),
      eq(scans.text_hash, hash),
    );
    const [scan] = await db.select().from(scans).where(filter).for("update");
    if (!scan || scan.status === "processing") return null;
    if (!needsBrowserDetection(scan.ai) || (scan.ai && "error" in result))
      return {
        ai: scan.ai,
        ai_score: scan.ai_score,
        ai_error: scan.ai_error,
        status: scan.status,
      };
    const ai =
      "passages" in result
        ? browserResult(
            result.passages,
            scan.character_count,
            result.exclusions,
            result.detector,
          )
        : null;
    if ("passages" in result && !ai) return null;
    const values = {
      ai,
      ai_score: ai?.score ?? null,
      ai_error: "error" in result ? detectionErrors[result.error] : null,
      status:
        ai && scan.writing
          ? "complete"
          : ai || scan.writing
            ? "partial"
            : "failed",
    } as const;
    await db.update(scans).set(values).where(filter);
    return values;
  });
}
