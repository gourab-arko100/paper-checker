# Paper Checker
Use strict TypeScript and App Router. Authenticate and authorize on the server, and pass verified Clerk user IDs to server-side Drizzle queries. Run private data queries under the transaction-local PostgreSQL owner context in `lib/db.ts` and retain explicit ownership predicates. Keep schema and SQL security migrations in `drizzle/`. Keep original documents in browser memory. Persist document-derived prose only with explicit consent. Keep provider credentials server-side and never log document text. Label provider failures and probabilistic estimates accurately. Run npm run check and npm run build before release.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
