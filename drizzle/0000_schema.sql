CREATE TABLE "api_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"scan_id" uuid,
	"provider" text NOT NULL,
	"characters_processed" integer NOT NULL,
	"request_count" integer NOT NULL,
	"attempted_requests" integer,
	"charged_characters" integer,
	"input_tokens" integer,
	"output_tokens" integer,
	"request_status" text DEFAULT 'reserved' NOT NULL,
	"estimated_cost" numeric,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usage_provider" CHECK ("api_usage"."provider" in ('sapling','gemini')),
	CONSTRAINT "usage_counts" CHECK ("api_usage"."characters_processed" > 0 and "api_usage"."request_count" > 0),
	CONSTRAINT "usage_attempted_requests" CHECK ("api_usage"."attempted_requests" between 0 and "api_usage"."request_count"),
	CONSTRAINT "usage_charged_chars" CHECK ("api_usage"."charged_characters" between 0 and "api_usage"."characters_processed"),
	CONSTRAINT "usage_status" CHECK ("api_usage"."request_status" in ('reserved','success','failed')),
	CONSTRAINT "usage_cost" CHECK ("api_usage"."estimated_cost" >= 0)
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"retain_document_text" boolean DEFAULT false NOT NULL,
	"retention_consent_at" timestamp with time zone,
	CONSTRAINT "valid_retention_consent" CHECK ("user_preferences"."retain_document_text" = ("user_preferences"."retention_consent_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "retained_document_text" (
	"scan_id" uuid PRIMARY KEY NOT NULL,
	"extracted_text" text NOT NULL,
	"ai" jsonb,
	"writing" jsonb,
	"retention_consent_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"document_name" text NOT NULL,
	"document_type" text NOT NULL,
	"document_hash" text NOT NULL,
	"text_hash" text NOT NULL,
	"word_count" integer NOT NULL,
	"character_count" integer NOT NULL,
	"page_count" integer,
	"ai_score" double precision,
	"writing_score" integer,
	"ai" jsonb,
	"writing" jsonb,
	"ai_error" text,
	"writing_error" text,
	"processing_duration" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'processing' NOT NULL,
	"active_until" timestamp with time zone DEFAULT now() + interval '2 minutes' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scans_user_id_document_hash_text_hash_unique" UNIQUE("user_id","document_hash","text_hash"),
	CONSTRAINT "scan_document_type" CHECK ("scans"."document_type" in ('pdf','docx','txt','paste')),
	CONSTRAINT "scan_hashes" CHECK ("scans"."document_hash" ~ '^[a-f0-9]{64}$' and "scans"."text_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "scan_counts" CHECK ("scans"."word_count" > 0 and "scans"."character_count" > 0 and "scans"."page_count" > 0),
	CONSTRAINT "scan_ai_score" CHECK ("scans"."ai_score" between 0 and 1),
	CONSTRAINT "scan_writing_score" CHECK ("scans"."writing_score" between 0 and 100),
	CONSTRAINT "scan_status" CHECK ("scans"."status" in ('processing','complete','partial','failed'))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"clerk_user_id" text PRIMARY KEY NOT NULL,
	"email" text,
	"display_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_usage" ADD CONSTRAINT "api_usage_user_id_users_clerk_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("clerk_user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_usage" ADD CONSTRAINT "api_usage_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_clerk_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("clerk_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retained_document_text" ADD CONSTRAINT "retained_document_text_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scans" ADD CONSTRAINT "scans_user_id_users_clerk_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("clerk_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_usage_provider_date" ON "api_usage" USING btree ("provider","created_at");--> statement-breakpoint
CREATE INDEX "api_usage_user_date" ON "api_usage" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "scans_owner_date" ON "scans" USING btree ("user_id","created_at" DESC NULLS LAST);