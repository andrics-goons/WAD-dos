# AGENTS.md

Instructions for AI coding tools (Claude Code reads this through `CLAUDE.md`). Teammates: this is also the short version of the conventions in `design-docs/`.

**CodeAlong** is a live-coding classroom for IS216 WAD2: a prof codes, students follow in a browser IDE, staff see who's stuck. Vue 3 SPA on Vercel, talking straight to **Supabase** (Postgres + Auth + Realtime + Edge Functions). **There is no server of ours.** Student code runs in a **StackBlitz WebContainer** in the student's browser.

`design-docs/01–09` are the source of truth. Read the relevant one before changing behaviour, and update it in the same PR when behaviour changes.

| Doc | Covers |
| --- | --- |
| 02 | Tech stack, folder layout, commands |
| 03 | Data model: every table, policy, view, trigger |
| 04 | Pages, routes, and the queries each page makes |
| 05 | Core logic (runtime, autosave, classifier, help queue, reports) |
| 06 | Stages and test IDs (`T-XXX-NN`) |
| 07 | Seed data and demo script |
| 08 | Who owns what |
| 09 | Contracts between owners: shared constants, auth, RLS helpers, privacy, RPC signatures |

## Layout

```text
codeAlong/
  src/api/*.api.js     one module per domain; the only code that calls supabase
  src/stores/          Pinia setup stores
  src/views/, src/components/ui/   pages and the shared UI kit (ca-btn, ca-input, ConfirmModal, EmptyState, toast)
  src/router/index.js  routes + guards (meta: auth, roles, guest, title)
  shared/              imported by BOTH the Vue app and the Deno Edge Functions
  supabase/migrations/ one file per schema change, applied in timestamp order
  supabase/seed.sql    demo data, loaded by `supabase db reset`
  supabase/functions/  Edge Functions (Deno + TypeScript)
  tests/unit/          Vitest; tests/unit/rls/ runs against the local Supabase stack
  e2e/                 Playwright
design-docs/
```

## Commands

Run everything from `codeAlong/`. **pnpm only.**

| Task | Command |
| --- | --- |
| Dev server | `pnpm dev` |
| Local Supabase | `pnpm exec supabase start` / `stop` / `status` |
| New migration | `pnpm exec supabase migration new <name>` |
| Apply new migrations, keep data | `pnpm exec supabase migration up` |
| Wipe local DB, re-apply all + seed | `pnpm exec supabase db reset` — **destroys local data; ask first** |
| Unit + RLS tests | `pnpm exec vitest run [file]` (RLS tests need the stack running) |
| E2E | `pnpm test:e2e` |
| Lint | `pnpm lint` |
| Format | `pnpm exec prettier --write <the files you changed>` — not `pnpm format`, which rewrites everyone's files |

Seeded accounts all use the password `pass1234` (list in `design-docs/07`): `prof@`, `ta.ana@`, `alex@`, `zoe@` (not enrolled), `prof.tan@`, `admin@codealong.test`. The live seeded session's join code is `CART42`. A new `supabase/functions/` folder is only picked up after `supabase stop` + `start`.

## App rules

- **Layering:** component → Pinia store → `src/api/*.api.js` → supabase. Components never import `@/lib/supabase`.
- **Errors:** every api function throws `mapError(error)` (`src/api/mapError.js`), an `AppError` with `code` and a user-safe `message`. Never show raw database or Supabase text to users. Codes: `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `BAD_REQUEST`, `VALIDATION_FAILED`, `RATE_LIMITED`, `UPSTREAM_UNAVAILABLE`, `INTERNAL`.
- **RLS returns zero rows, not an error,** for data you may not see. Every view needs a real empty / not-found state (`EmptyState`).
- **Secrets:** the service-role key lives only in Edge Functions. Never in `src/`, never in a `VITE_` variable.
- **`shared/` must not touch** the DOM, `window`, `Deno` or the network. `shared/constants.js` is a team contract: tell the team before changing it.
- **No cross-origin assets.** WebContainer needs COOP/COEP headers, which block CDN fonts/scripts. Everything is self-hosted or bundled.
- **Egress budget (free tier, 5 GB):** only source files sync to Supabase — never `node_modules/`, `dist/`, `.vite/`. Check `files_hash` before downloading `files`.

## Frontend rules (Vue)

- **Use the component library first.** Reach for `src/components/ui/` (`ConfirmModal`, `EmptyState`, `StatusPill`, the toast store) and the kit classes (`ca-btn`, `ca-input`, `ca-label`, `ca-field`, `ca-card`; all shown at `/_kit`) before writing new markup.
- **Repeated UI becomes a component.** If the same markup appears more than once and makes sense on its own, make it a component — shared ones in `src/components/ui/`.
- **Bootstrap first** for layout, grid, spacing, display and text. The theme is Bootstrap overridden in the global stylesheet (`src/styles/`, loaded once through `main.css`), so every page looks the same. Don't restyle Bootstrap inside a component.
- **No inline styles.** No `style="…"`. Avoid `<style>` blocks in components; if one is truly needed, keep it to a few scoped lines.
- **Don't define custom patterns.** Follow the ones already in the codebase (component → store → api, the kit classes, Bootstrap utilities). No new CSS naming schemes, helpers or abstractions when an existing one fits.
- **Keep it simple.** Write the simplest code that works. No speculative options, wrappers or configuration nobody asked for.
- **Only the attributes an element needs.** The exceptions are the ones that are needed: `data-testid` values listed in `design-docs/09` (the Playwright contract), `id` / `for` pairing a label with its input, and `alt` on images.
- **No ARIA attributes.** Don't add `aria-*` (`aria-label`, `aria-hidden`, `aria-invalid`, `aria-describedby`, …) or `role`. This overrides the accessibility notes in `design-docs/10-ui-kit.md`. Mark an invalid input with the `ca-input--invalid` class and put its message in a `ca-field-error` paragraph: `:class="{ 'ca-input--invalid': errorMsg }"`.

## Database rules

Andric owns the schema; others request changes by PR. See `design-docs/03` and `09 §4–5`.

- **Keep it simple.** Write the simplest SQL, RPC or Edge Function that does the job and works. No extra tables, columns, triggers, checks, helpers or edge-case handling the feature doesn't need. Build what was asked, not what might be useful later.
- **Until the cloud project goes live, migrations on `main` may be edited** — then everyone runs `pnpm exec supabase db reset` after pulling. Once it's live, never edit one; add a new migration instead.
- **Every table:** RLS enabled, its policies, and exactly one `create policy "admin reads all" … for select using (public.is_admin())`. No admin write policies. The policy sweep test (T-ADM-09) fails otherwise.
- **A policy must never query its own table** (Postgres error 42P17, infinite recursion). Go through a `security definer` helper: `is_course_staff`, `is_course_prof`, `is_enrolled`, `is_course_member`, `is_session_member`, `is_session_staff`.
- **Functions and helpers:** `security definer`, `set search_path = ''`, every name schema-qualified (`public.x`, `auth.uid()`).
- **Guards are null-safe:** check `auth.uid() is null` explicitly, and use `is distinct from`, never `<>` (`null <> x` is `null`, which lets the caller through).
- **RPC errors:** `raise exception 'CODE|Friendly message' using errcode = 'P0001';` — `mapError` splits it into `code` and `message`.
- **Roles** come from `profiles` via `app_role()` / `is_admin()`. Never from the JWT or auth metadata, which users can rewrite.
- **Check functions:** use `case`, not `and`, when later checks depend on earlier ones (SQL doesn't promise `and` short-circuits).
- **Privacy rules (`09 §5`) are tested:** a student's code is readable by them and their course's staff, never by classmates or other courses' staff; "Slow down" reaches staff only as a count; `student_status` has no `state` column (the `session_tiles` view derives it).
- **Verifying a migration:** run it inside `begin; … rollback;` with `docker exec -i supabase_db_codeAlong psql -U postgres`, then apply it with `supabase migration up`.

## Tests

- Test names start with their ID from `design-docs/06`, e.g. `it('T-PRIV-03: a classmate cannot read …')`.
- Tests that hit the local stack start with `// @vitest-environment node` and use `tests/unit/rls/_helpers.js`: `createUser` (admin API, avoids the auth rate limit), `userClient`, `service`, `makeAdmin`, `cleanup`.
- Clean up in `afterAll`: delete sessions, then courses, then call `cleanup()`. Those foreign keys don't cascade, so users can't be deleted first.
- Tests of `src/api/*` mock `@/lib/supabase` with `anonClient()` (see `tests/unit/api/courses.api.test.js`).
- Edge Functions keep their logic in `handler.ts` with dependencies injected, so Vitest can run them with fakes; `index.ts` only wires in real clients.
- Playwright: if the bundled Chromium is missing, launch with `channel: 'chrome'`.

## Ownership

Each member owns their files (full table in `design-docs/08`). **Before editing a file another member owns, say so and ask.** Flag problems in someone else's code rather than fixing it silently.

| Member | Owns |
| --- | --- |
| Ying Qi | Session + checkpoint RPCs, Realtime, app shell, UI kit, core pages, Vercel |
| Dylan | Student workspace: WebContainer runtime, editor, terminal, preview, Done / Slow down / Help bar |
| Karin | Help queue, follow-ups, Telegram, announcements, Playwright setup |
| Evan | Prof view: lessons + TODO parser, teach view, dashboard, report page |
| Ray Yien | IndexedDB cache, autosave, catch-up, diff, replay, GitHub import / export |
| Andric | The whole schema (migrations, RLS, views, triggers), auth, `courses.api` / `admin.api`, seed, report data |

## Git

- One branch per change, merged to `main` by PR. Don't commit or push unless asked.
- Commit as the human running the tool. **Don't add AI co-author trailers or "Generated with" lines** — each member writes their own AI-usage declaration.
- Don't commit Supabase CLI state (`supabase/.branches/`, `supabase/.temp/`) or `.env.local`.
