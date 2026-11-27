import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lt,
  or,
  sql,
} from "drizzle-orm";
import { withOwner } from "./db";
import { preferences, retained, scans, users } from "./schema";

const scanList = {
  id: scans.id,
  document_name: scans.document_name,
  document_type: scans.document_type,
  created_at: scans.created_at,
  word_count: scans.word_count,
  character_count: scans.character_count,
  page_count: scans.page_count,
  processing_duration: scans.processing_duration,
  ai_score: scans.ai_score,
  writing_score: scans.writing_score,
  status: scans.status,
};
export type ScanRow = Pick<typeof scans.$inferSelect, keyof typeof scanList>;

export function normalizeDate<T extends { created_at: string }>(row: T): T {
  return { ...row, created_at: new Date(row.created_at).toISOString() };
}

export async function recent(owner: string, limit = 6) {
  const rows = await withOwner(owner, (db) =>
    db
      .select(scanList)
      .from(scans)
      .where(eq(scans.user_id, owner))
      .orderBy(desc(scans.created_at), asc(scans.id))
      .limit(limit),
  );
  return rows.map(normalizeDate);
}

type HistoryFilters = {
  q?: string;
  type?: ScanRow["document_type"];
  sort: "new" | "old" | "name" | "ai" | "writing";
  from?: string;
  to?: string;
  ai?: number;
  writing?: number;
  page: number;
};

export function history(owner: string, filters: HistoryFilters) {
  const where = and(
    eq(scans.user_id, owner),
    filters.q
      ? ilike(
          scans.document_name,
          "%" + filters.q.replace(/[\\%_]/g, "\\$&") + "%",
        )
      : undefined,
    filters.type ? eq(scans.document_type, filters.type) : undefined,
    filters.from
      ? gte(scans.created_at, filters.from + "T00:00:00Z")
      : undefined,
    filters.to
      ? sql`${scans.created_at} < ${filters.to}::date::timestamp at time zone 'UTC' + interval '1 day'`
      : undefined,
    filters.ai === undefined
      ? undefined
      : gte(scans.ai_score, filters.ai / 100),
    filters.writing === undefined
      ? undefined
      : gte(scans.writing_score, filters.writing),
  );
  const order = {
    new: desc(scans.created_at),
    old: asc(scans.created_at),
    name: asc(scans.document_name),
    ai: sql`${scans.ai_score} desc nulls last`,
    writing: sql`${scans.writing_score} desc nulls last`,
  };
  return withOwner(owner, async (db) => {
    const [{ total }] = await db
      .select({ total: count() })
      .from(scans)
      .where(where);
    const rows = await db
      .select(scanList)
      .from(scans)
      .where(where)
      .orderBy(order[filters.sort], asc(scans.id))
      .limit(12)
      .offset((filters.page - 1) * 12);
    return { rows: rows.map(normalizeDate), count: total };
  });
}

export type ComparisonRow = Pick<
  typeof scans.$inferSelect,
  | "id"
  | "document_name"
  | "created_at"
  | "ai_score"
  | "writing_score"
  | "writing"
  | "word_count"
>;
export function comparisons(owner: string, page: number, pair: string[]) {
  const where = and(
    eq(scans.user_id, owner),
    inArray(scans.status, ["complete", "partial"]),
  );
  const fields = {
    id: scans.id,
    document_name: scans.document_name,
    created_at: scans.created_at,
  };
  return withOwner(owner, async (db) => {
    const [{ total }] = await db
      .select({ total: count() })
      .from(scans)
      .where(where);
    const options = await db
      .select(fields)
      .from(scans)
      .where(where)
      .orderBy(desc(scans.created_at), asc(scans.id))
      .limit(100)
      .offset((page - 1) * 100);
    const selected: ComparisonRow[] = pair.length
      ? await db
          .select({
            ...fields,
            ai_score: scans.ai_score,
            writing_score: scans.writing_score,
            writing: scans.writing,
            word_count: scans.word_count,
          })
          .from(scans)
          .where(and(where, inArray(scans.id, pair)))
      : [];
    return { count: total, options, selected };
  });
}

export function report(owner: string, id: string) {
  return withOwner(owner, async (db) => {
    const [base] = await db
      .select()
      .from(scans)
      .where(and(eq(scans.id, id), eq(scans.user_id, owner)));
    if (!base) return null;
    const [detail] = await db
      .select({ text: retained.extracted_text, writing: retained.writing })
      .from(retained)
      .innerJoin(scans, eq(scans.id, retained.scan_id))
      .where(and(eq(retained.scan_id, id), eq(scans.user_id, owner)));
    return {
      scan: {
        ...normalizeDate(base),
        writing: detail?.writing ?? base.writing,
      },
      text: detail?.text,
    };
  });
}

export async function retainsText(owner: string) {
  const [row] = await withOwner(owner, (db) =>
    db
      .select({ retain: preferences.retain_document_text })
      .from(preferences)
      .where(eq(preferences.user_id, owner)),
  );
  return Boolean(row?.retain);
}

export function removeScans(owner: string, ids?: string[]) {
  return withOwner(owner, async (db) => {
    const activeWhere = and(
      eq(scans.status, "processing"),
      sql`${scans.active_until} > now()`,
    );
    const removed = await db
      .delete(scans)
      .where(
        and(
          eq(scans.user_id, owner),
          ids ? inArray(scans.id, ids) : undefined,
          or(
            sql`${scans.status} <> 'processing'`,
            lt(scans.active_until, sql`now()`),
          ),
        ),
      )
      .returning({ id: scans.id });
    const [{ total }] = await db
      .select({ total: count() })
      .from(scans)
      .where(and(eq(scans.user_id, owner), activeWhere));
    return { deleted: removed.length, active: total };
  });
}

export async function removeWorkspace(owner: string) {
  await withOwner(owner, (db) =>
    db.delete(users).where(eq(users.clerk_user_id, owner)),
  );
}

export async function setRetention(owner: string, retain: boolean) {
  await withOwner(owner, (db) =>
    db.execute(sql`select public.set_retention(${owner}, ${retain})`),
  );
}
