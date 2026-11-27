# Paper Checker progress

Implementation plan: establish the Next.js foundation and public design, then implement Clerk and PostgreSQL ownership, browser document processing, provider analysis and accounting, report presentation, workspace history and administration, and verification.

## Foundation
Next.js, TypeScript, Tailwind, the public site, interactive illustrative report, themes and shared components are in place.

## Authentication and database
Clerk sign-in and sign-up routes, authenticated workspace layout, scoped database access and the initial ownership, retention and quota migration are implemented. Live projects must be configured to verify these integrations.

## Document processing
Browser-only file validation and extraction are implemented, with PDF layout reconstruction and conservative run-to-text geometry. Scanned PDFs receive an explicit unsupported-document message. PDF reading order remains heuristic.

## Provider integration
Sapling and Gemini execute in parallel, with independent validation and results. Database leases and quota reservations protect concurrent requests. Gemini feedback is verified against source quotations before it becomes a report issue.

## Analysis interface
The report supports original and text views, scoped highlights, provider-specific errors and retry, matching-file restoration and on-demand PDF exports.

## Workspace and administration
Dashboard analytics, server-paginated history, comparison, retention settings, account deletion and admin views are implemented. The admin account directory links account management to Clerk as the identity authority.

## Verification and deployment preparation
- Passed lint, strict TypeScript, all 10 automated tests, the Next.js production build and the production HTTP smoke checks.
- The production dependency audit reported zero known vulnerabilities at verification time.
- README and MIT license are in place. The README covers provider setup, database migration, deployment and limitations.
- Live Clerk sign-in, a live Neon connection, provider requests and authenticated browser flows require configured staging credentials. The managed preview relay timed out, so visual browser QA and screenshots remain pending.
- PDF layouts and overlays are best effort for unusual documents. Scanned PDFs without text are explicitly rejected with a searchable-PDF or pasted-text fallback.


## Neon PostgreSQL and Drizzle

The data layer now uses Neon’s serverless driver and Drizzle. A restricted PostgreSQL role and a transaction-local Clerk subject enforce row-level ownership in addition to application filters. The Drizzle migrations include the tables, consent checks, scan leases and atomic quota reservations. Clerk, Sapling and Gemini continue to use their existing credentials.

The deployment needs a Neon project connection string and the checked-in Drizzle migrations applied to its target database. The test suite applies the same migrations to embedded PostgreSQL. A live Neon connection is pending configuration.

Verification passed for the Drizzle migration journal, the two production SQL migrations on embedded PostgreSQL, all 11 tests, lint, TypeScript, the production build and HTTP smoke checks. A separate check applied the migrations using a non-superuser role with database CREATE and CREATEROLE privileges. Sapling and Gemini provider code remained unchanged.

## PDF preview and provider reliability

The embedded PDF reader uses a non-form search region, handles Enter in the search input and marks every reader button as a non-submit button. Sapling uses the documented request body and classifies trial allowance, expiration and endpoint errors. Gemini uses the official Flash-Lite model ID and a compatible structured-output schema with independent local validation. Provider logs contain only allowlisted codes and fixed messages. Retries reuse successful provider results.

Live Sapling and Gemini calls require configured credentials. The regression suite exercises the client payloads, failure handling, privacy and retries with mocked responses.

## Gemini schema rejection follow-up

Gemini now receives its rubric contract in the prompt with JSON mode enabled. The request sends neither server-side schema field, so the rejected schema compiler is out of the request path. Local Zod validation still gates all scores. The Sapling HTTP 402 response now directs the user to their account’s detector API access and billing settings.

## Browser-based detection

New scans use Transformers.js and the pinned public TMR detector in a Web Worker. Quantized inference stays in the browser, with WebGPU for supported hardware and a WASM CPU fallback. Passage coverage, weighted aggregation, upload provenance, and PDF offsets are preserved. Gemini writing analysis runs independently. No database migrations or new credentials are required, and historical detector records remain readable.

Chromium ran the real Q8 model using local copies of the pinned public assets. Human-authored, generated and mixed samples produced complete results. A 10-page generated PDF supplied 9,500 characters across five passages, with source offsets covering the last page. The production Webpack worker also completed a WASM inference. These are functional checks and do not measure detection accuracy.

## Detection accuracy investigation

Verified the official TMR label mapping and inspected the model's two raw logits in Chromium. The human-authored Darwin fixture scored 93.85% under Q8 and 92.42% under FP32 ONNX. Q4 scored the same fixture 38.84%. These results demonstrate a false positive and quantization sensitivity, not a label inversion. The README records the fixture comparisons and investigation limits.

New browser scans exclude recognizable front matter and reference ranges without rewriting document offsets. Development reports have a local diagnostics panel for Auto, Q4, Q8 and FP32. The worker validates token lengths and computes softmax from raw logits. Gemini retains the eight-score mean and its existing validation. No scoring thresholds, model weights, paid services or database migrations were introduced.

## Local Desklib pilot

New scans in the pilot use the pinned Desklib v1.01 INT8 export with ONNX Runtime Web 1.31.1. The browser worker streams model weights into persistent origin-private storage, then scores passages sequentially. The experimental 0.15 cutoff applies only to the new detector. TMR remains selectable in development diagnostics and historical TMR results retain their provenance and review cutoff. No environment variables or database migrations were added.
