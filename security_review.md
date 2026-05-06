# Security Review — CardConnect

**Reviewed:** Pre-publish scan for card.pplx.app  
**Project:** `/home/user/workspace/cardconnect`  
**Context:** Mobile-first personal-use app; on-device OCR → Express/SQLite backend; OpenAI for parse/draft; single-tenant, no auth, no payment data.

---

## Security Review Results

### BLOCK (must fix before publishing)

- **SQLite database files committed to project directory** — `data.db`, `data.db-shm`, `data.db-wal` are present at the project root and will be included in the published tarball if not excluded at deploy time. `.gitignore` correctly lists them, but they exist on disk and will ship unless the publish pipeline explicitly excludes them. Even though they currently contain 0 rows, the files expose the schema and any future data written during development. — `data.db` / `data.db-shm` / `data.db-wal` — **Fix:** Confirm the publish pipeline strips these files (add them to `.publishignore` or equivalent, or delete before publish). The `.gitignore` entry is correct but does not affect file packaging.

---

### WARN (inform user, let them decide)

- **No rate limiting on LLM-backed endpoints** — `/api/parse-card` and `/api/draft-message` forward user-supplied text directly to the OpenAI API with no per-IP or per-session rate limit. `express-rate-limit` is listed in the build allowlist but is never imported or applied in `server/index.ts` or `server/routes.ts`. A public URL with no auth and no throttle exposes the developer's OpenAI API key to unlimited proxy use by anyone who discovers the endpoint. — `server/routes.ts:116,156` — **Fix:** Add `express-rate-limit` middleware (e.g. 20 req/min per IP) on `/api/parse-card` and `/api/draft-message`, or gate them behind a simple shared secret header since this is a personal-use app.

- **Unbounded input length forwarded to LLM** — `parseCardSchema` validates only `z.string().min(1)` with no `.max()`, and `draftMessageSchema` similarly has no length cap on `notes` or `metContext`. An attacker (or curious visitor) can POST arbitrarily large text payloads directly to the API, incurring token costs and potentially triggering context-window errors. — `shared/schema.ts:36,42-47` — **Fix:** Add `.max(4000)` (or similar) to `rawText`, `notes`, and `metContext` in the Zod schemas.

- **`dangerouslySetInnerHTML` in chart component** — `client/src/components/ui/chart.tsx:81` uses `dangerouslySetInnerHTML` to inject CSS custom-property declarations. The injected content (`--color-${key}: ${color}`) is derived from the `ChartConfig` object passed by the developer, not from user-submitted contact data, so this is not currently exploitable. However, if chart config is ever derived from contact fields (e.g. a name or company used as a CSS variable), it could become an XSS vector. — `client/src/components/ui/chart.tsx:81` — **Fix:** No immediate action required given current data flow; note the pattern for future review if chart data sources change.

---

### PASS

- **Dependency audit** — `npm audit` reports 0 vulnerabilities across 614 dependencies (0 critical, 0 high, 0 moderate, 0 low).
- **Hardcoded secrets** — No API keys, tokens, passwords, or private keys found in any source file (`.ts`, `.js`, `.json`, `.yaml`, `.toml`, `.env`). OpenAI key is correctly read from `process.env.OPENAI_API_KEY` at runtime with a safe null-check.
- **`.env` files** — No `.env` files present in the project (`.gitignore` excludes them; none exist on disk). No server-side secrets at risk of being bundled.
- **SQL injection** — All database queries use Drizzle ORM's parameterized query builder (`eq()`, `.where()`, `.values()`). No raw SQL string interpolation found.
- **CORS** — No `cors()` middleware is imported or applied in `server/index.ts` or `server/routes.ts`. The API is same-origin only, which is appropriate for a personal-use app.
- **Python vulnerabilities** — Not applicable (Node.js project only).

---

## Actions Already Taken

None — no BLOCK findings were auto-fixed because the database file exclusion requires a deploy-pipeline change, not a source-code edit. The `.gitignore` entry for `data.db` is already correct.

## Recommended Actions Before Publishing

1. **[BLOCK]** Delete or exclude `data.db`, `data.db-shm`, `data.db-wal` from the published artifact. Add a pre-publish step: `rm -f data.db data.db-shm data.db-wal`.
2. **[WARN]** Apply `express-rate-limit` to `/api/parse-card` and `/api/draft-message`.
3. **[WARN]** Add `.max()` caps to `rawText`, `notes`, and `metContext` in `shared/schema.ts`.
