import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import type { Scan } from "./results";

const time = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "string" });
const created = () => time("created_at").notNull().defaultNow();

export const users = pgTable("users", {
  clerk_user_id: text().primaryKey(),
  email: text(),
  display_name: text(),
  created_at: created(),
});

export const preferences = pgTable(
  "user_preferences",
  {
    user_id: text()
      .primaryKey()
      .references(() => users.clerk_user_id, { onDelete: "cascade" }),
    retain_document_text: boolean().notNull().default(false),
    retention_consent_at: time("retention_consent_at"),
  },
  (t) => [
    check(
      "valid_retention_consent",
      sql`${t.retain_document_text} = (${t.retention_consent_at} is not null)`,
    ),
  ],
);

export const scans = pgTable(
  "scans",
  {
    id: uuid().primaryKey().defaultRandom(),
    user_id: text()
      .notNull()
      .references(() => users.clerk_user_id, { onDelete: "cascade" }),
    document_name: text().notNull(),
    document_type: text({ enum: ["pdf", "docx", "txt", "paste"] }).notNull(),
    document_hash: text().notNull(),
    text_hash: text().notNull(),
    word_count: integer().notNull(),
    character_count: integer().notNull(),
    page_count: integer(),
    ai_score: doublePrecision(),
    writing_score: integer(),
    ai: jsonb().$type<Scan["ai"]>(),
    writing: jsonb().$type<Scan["writing"]>(),
    ai_error: text(),
    writing_error: text(),
    processing_duration: integer().notNull().default(0),
    status: text({ enum: ["processing", "complete", "partial", "failed"] })
      .notNull()
      .default("processing"),
    active_until: time("active_until")
      .notNull()
      .default(sql`now() + interval '2 minutes'`),
    created_at: created(),
  },
  (t) => [
    unique().on(t.user_id, t.document_hash, t.text_hash),
    index("scans_owner_date").on(t.user_id, t.created_at.desc()),
    check(
      "scan_document_type",
      sql`${t.document_type} in ('pdf','docx','txt','paste')`,
    ),
    check(
      "scan_hashes",
      sql`${t.document_hash} ~ '^[a-f0-9]{64}$' and ${t.text_hash} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      "scan_counts",
      sql`${t.word_count} > 0 and ${t.character_count} > 0 and ${t.page_count} > 0`,
    ),
    check("scan_ai_score", sql`${t.ai_score} between 0 and 1`),
    check("scan_writing_score", sql`${t.writing_score} between 0 and 100`),
    check(
      "scan_status",
      sql`${t.status} in ('processing','complete','partial','failed')`,
    ),
  ],
);

export const retained = pgTable("retained_document_text", {
  scan_id: uuid()
    .primaryKey()
    .references(() => scans.id, { onDelete: "cascade" }),
  extracted_text: text().notNull(),
  ai: jsonb().$type<Scan["ai"]>(),
  writing: jsonb().$type<Scan["writing"]>(),
  retention_consent_at: time("retention_consent_at").notNull(),
});

export const apiUsage = pgTable(
  "api_usage",
  {
    id: uuid().primaryKey().defaultRandom(),
    user_id: text().references(() => users.clerk_user_id, {
      onDelete: "set null",
    }),
    scan_id: uuid().references(() => scans.id, { onDelete: "set null" }),
    provider: text({ enum: ["sapling", "gemini"] }).notNull(),
    characters_processed: integer().notNull(),
    request_count: integer().notNull(),
    attempted_requests: integer(),
    charged_characters: integer(),
    input_tokens: integer(),
    output_tokens: integer(),
    request_status: text({ enum: ["reserved", "success", "failed"] })
      .notNull()
      .default("reserved"),
    estimated_cost: numeric({ mode: "number" }),
    created_at: created(),
  },
  (t) => [
    index("api_usage_provider_date").on(t.provider, t.created_at),
    index("api_usage_user_date").on(t.user_id, t.created_at),
    check("usage_provider", sql`${t.provider} in ('sapling','gemini')`),
    check(
      "usage_counts",
      sql`${t.characters_processed} > 0 and ${t.request_count} > 0`,
    ),
    check(
      "usage_attempted_requests",
      sql`${t.attempted_requests} between 0 and ${t.request_count}`,
    ),
    check(
      "usage_charged_chars",
      sql`${t.charged_characters} between 0 and ${t.characters_processed}`,
    ),
    check(
      "usage_status",
      sql`${t.request_status} in ('reserved','success','failed')`,
    ),
    check("usage_cost", sql`${t.estimated_cost} >= 0`),
  ],
);
