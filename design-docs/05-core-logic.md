# CodeAlong — Core Logic & Algorithms

This is the "how it actually works" document: the parts that make CodeAlong a Tier 2/3 project rather than a CRUD app. Each section names its owner and the test that pins it down.

**Where logic lives now.** With no Express server there are four homes, and choosing correctly is the main design decision in this doc:

| Home | For | Why there |
|---|---|---|
| `shared/*.js` | Pure functions — normaliser, classifier, diff, excerpt, report, checkpoint labels | No DOM, no network, no `Deno`; unit-tested with Vitest; imported by both the Vue app and the Edge Functions |
| `src/` (browser) | Anything the user's own data drives: the **WebContainer runtime**, re-parsing, diffing, error grouping, the IndexedDB cache | Already trusted with that data; a round-trip would add latency and nothing else |
| Postgres (RPC / view / trigger) | Anything a client must not decide: roles, join codes, `seq`, state transitions, **tile state** | `security definer` and RLS make it unforgeable |
| Edge Function (Deno) | Anything needing an API secret or elevated rights: Telegram, GitHub, LLM, Spotlight, reports | The only place secrets exist |

| # | Logic | Owner | Tier | Home | Tested in |
|---|---|---|:---:|---|---|
| 1 | **Client-side runtime (WebContainer)** | Dylan | **3** | browser | `tests/unit/build-error.test.js`, E2E `workspace.spec.js` |
| 2 | **Files, cache & dependencies** | Ray Yien (files, autosave) · Dylan (dependencies) | 2–3 | browser + Postgres | `tests/unit/files-cache.test.js`, E2E `workspace.spec.js` |
| 3 | Session lifecycle | Ying Qi | 2 | RPC | `tests/unit/rls/sessions.test.js`, E2E `live-session.spec.js` |
| 4 | Status reporting + classifier | Andric (view) · Evan (`classify()`) | 3 | view + `shared/` | `tests/unit/tile-state.test.js`, `tests/unit/rls/status.test.js` |
| 5 | ~~TODO parser → lesson plan~~ (removed: no lesson steps) | — | — | — | — |
| 6 | Error normalisation + grouping (runtime **and build** errors) | Evan | **3** | `shared/` | `tests/unit/error-normalizer.test.js` |
| 7 | Catch-up + "What you missed" | Ray Yien (RPC, diff) · Dylan (mount, reinstall) | 2–3 | RPC + browser | `tests/unit/diff-summary.test.js`, E2E `catch-up.spec.js` |
| 8 | Help queue + Telegram ping | Karin | 2 | RPC + function | E2E `help.spec.js` |
| 9 | Spotlight anonymisation | Evan | 2 | function + `shared/` | `tests/unit/spotlight.test.js` |
| 10 | Insights report + trends | Andric | 2–3 | function + `shared/` | `tests/unit/report-builder.test.js` |
| 11 | Replay + GitHub import/export | Ray Yien | 2 | function | `tests/unit/github-export.test.js`, E2E `replay.spec.js` |
| 12 | Telegram bot integration | Karin | 2 | function | `tests/unit/telegram.test.js` |
| 13 | Stretch: auto checkpoint checks, AI hints, VS Code reporter | Dylan · Karin | 3 | — | — |

---

## 1. Client-Side Runtime (WebContainer)

**Goal:** give every student a real Node project running in their own browser — real `import`s, real `pnpm install`, a real dev server and a real terminal — capture every error, and make sure their code can't touch CodeAlong itself.

This replaces the old `srcdoc` iframe + injected probe. Two things that used to be hard are now free, and one new class of error appears.

### How a session boots

```
IndexedDB cache  ──┐
                   ├──▶ WebContainer.boot()  ──▶ fs.mount(files)  ──▶ pnpm install  ──▶ pnpm dev
Supabase files   ──┘          (WASM Node)         source files only       (if needed)      │
                                                                                            ▼
                                                               server-ready event → preview URL
                                                                                            │
                                                                        <iframe src=previewUrl>
```

| Step | Detail |
|---|---|
| 1. Resolve files | `files_hash` check against IndexedDB (see §2); fetch from Supabase only on a miss |
| 2. Boot | `WebContainer.boot({ coep: 'credentialless' })` — one instance per tab, booted once and reused across checkpoints |
| 3. Mount | `container.mount(toFileSystemTree(files))` — **source files only**, never `node_modules` |
| 4. Install | `pnpm install` as a spawned process, streamed to the terminal panel. Skipped entirely when the dependency tree is unchanged (§2) |
| 5. Run | `pnpm dev` (Vite) plus any second process the lesson needs (e.g. its Express endpoint); the `server-ready` event hands back the preview URL |
| 6. Preview | `<iframe>` pointed at that URL — cross-origin to our app, so our Supabase session stays unreachable |

### Hard requirement: cross-origin isolation

WebContainer needs `SharedArrayBuffer`, which needs the page to be cross-origin isolated:

```
Cross-Origin-Embedder-Policy: credentialless     (or require-corp)
Cross-Origin-Opener-Policy:   same-origin
```

Set in `vercel.json` next to the SPA rewrite — see [02](./02-tech-stack.md#deployment). We default to `credentialless` because `require-corp` additionally demands that **every** cross-origin subresource send `Cross-Origin-Resource-Policy`, which would break any CDN asset. Our own app bundles Bootstrap and CodeMirror through Vite, so there is little exposure either way, but fonts must be self-hosted rather than pulled from Google Fonts.

### What we capture, and from where

The error pipeline now has **two** sources. This is the main design change for Evan's grouping and the dashboard.

| Source | How | Shape |
|---|---|---|
| **Build / compile** (new) | `process.output` from `pnpm dev` — Vite reports a failed transform on stdout | `{ source: 'build', name, message, file, line }` |
| **Runtime** | `probe.js`, shipped **as part of the lesson template** (`src/ca-probe.js`, imported by `main.js`) rather than injected into HTML — the dev server builds the app, so we can no longer string-munge it | `{ source: 'runtime', name, message, file, line }` |
| `console` | Same probe, wrapping `console.log/info/warn/error` | `{ level, args: safeSerialize(args) }` |
| `rejection` | `unhandledrejection` | Same shape as runtime |
| `vue-warn` | `console.warn` starting with `[Vue warn]` | Warning in the console, **not** an error |
| `network` | Wrapped `fetch` + `XMLHttpRequest` | `{ method, url, status }` |
| Terminal | `process.output` from every spawned process | Rendered in the terminal panel, **never** sent anywhere |

Runtime messages still arrive by `postMessage`, and `PreviewFrame.vue` still accepts them only when `event.source === iframe.contentWindow` and `data.runId === currentRunId`.

> ### ⚠ Build errors contain source code — strip the frame before it leaves the browser
>
> A Vite transform error does not just say "unexpected token"; it prints a **code frame** with the offending lines. Forwarding that to `student_status.error` would put a student's code on the prof's dashboard and break the privacy contract in [09](./09-integration-contracts.md#5-privacy-contract-our-unique-feature--every-pr-is-checked-against-this).
>
> `parseBuildError()` in `shared/build-error.js` therefore keeps only `{ name, message, file, line }` and **drops every line of the code frame**, before `normalizeError()` ever sees it. Truncating to `ERROR_MESSAGE_MAX` is *not* sufficient — 300 characters of a code frame is still 300 characters of someone's code. T-PRIV-09 asserts this on real Vite output.

### What we no longer need

| Gone | Why |
|---|---|
| `srcdoc-builder.js` (inlining local CSS/JS, rewriting `<script src>`) | Vite does the real thing |
| The `localStorage` shim | The preview is served from a real origin, so `localStorage` works natively. **This was the riskiest browser detail in the project and it no longer exists** |
| The mock API (old §2) | Lessons run a real server now — see §2 |
| "ES-module `import` between local files isn't supported" | It is. This limitation comes off the README |

### Re-run policy

- Vite's own HMR handles most changes — no explicit run step for a file edit.
- A full restart is triggered by the Run button or when `package.json` changes (which also re-installs).
- Each boot/restart gets a fresh `runId`; messages from older runs are ignored.
- **Boot and install timeouts:** no `server-ready` within `BOOT_TIMEOUT_MS` → "Your project didn't start — check the terminal". An install exceeding `INSTALL_TIMEOUT_MS` keeps streaming but surfaces a "still installing" state rather than looking frozen.
- Infinite loop in the student's own code: the preview iframe hangs, not the container; the Run button stays live so they can restart.

### Browser support

WebContainer needs `SharedArrayBuffer`, cross-origin isolation and a service worker — so Chrome and Edge work, and Safari may not start at all. Grading is Chrome-only (FAQ 5), so this is not a marks risk, but a teammate or marker on Safari must see **"The workspace needs Chrome or Edge"**, not a blank pane. Feature-detect `crossOriginIsolated` before booting.

**Spike first (Week 8), owner Dylan — four unknowns, all cheap to test:**

1. Does the service worker WebContainer uses conflict with the SPA catch-all rewrite, or serve a stale `index.html`?
2. Does pnpm's symlinked `node_modules` layout work in the virtual FS, or do we need `node-linker=hoisted` in `.npmrc`?
3. What is the actual cold `pnpm install` time for the Mini Cart project? (This decides §2's dependency cache.)
4. Confirm the preview origin really is cross-origin to our app, so T-SBX-05 still holds.

---

## 2. Files, Cache & Dependencies

Three tiers, with one rule: **Supabase only ever carries source files.**

```
Supabase (source of truth)  →  IndexedDB (per-device cache)  →  WebContainer FS (working copy)
  lesson starter files           keyed by hash, survives          mounted on boot
  checkpoint files               refresh and offline              pnpm install happens HERE
  the student's own autosave     never the source of truth        node_modules never leaves it
```

### Change detection — the `files_hash` check

"Fetch only when it changed" needs a probe cheaper than the thing it is checking. `lessons`, `checkpoints` and `snapshots` each carry a generated column:

```sql
files_hash text generated always as (md5(files::text)) stored
```

The client selects `id, files_hash` — tens of bytes per row — and pulls the `files` column only on a mismatch. A student rejoining a session they already loaded costs **almost zero egress**, which is the whole point of the cache.

```js
// src/cache/files.js
export async function loadFiles(kind, id, remoteHash) {
  const hit = await idb.get(`${kind}:${id}`)
  if (hit?.hash === remoteHash) return hit.files          // no network at all
  const files = await api.fetchFiles(kind, id)            // the only call that costs egress
  await idb.put(`${kind}:${id}`, { hash: remoteHash, files })
  return files
}
```

Built as `src/cache/files.js`, with the Supabase calls in `src/api/files.api.js` (`fetchFiles`, the cheap `fetchHash` probe, and `findMyAutosave`). Two details beyond the sketch above: with no `remoteHash` it probes the hash before downloading anything, and it stores the hash that came back with the files. **A student's own snapshots are never cached:** on a shared lab computer the next person could read them out of IndexedDB, and an autosave changes every few seconds anyway. Only lessons and checkpoints, the files 40 students all load, go in the cache.

IndexedDB is a **cache and an outbox, never the source of truth.** Browsers evict it silently under storage pressure, so every read must survive a miss, and pending autosaves in the outbox must be flushed to Supabase rather than relied upon. Eviction is then a slow load, not lost work.

### What syncs, and what never does

A real project's working tree holds far more than the student's code. Autosaving it whole would blow both the size cap and the egress budget on the first keystroke, so sync is an **allowlist**, not a tree walk:

```js
// shared/constants.js
SYNC_IGNORE: ['node_modules/**', 'dist/**', '.vite/**', '.cache/**',
              'pnpm-lock.yaml', '*.log']
```

`MAX_FILES` is raised from 20 to **40**: a bare Vite + Vue scaffold is already ~10 files before the student writes anything. `MAX_SNAPSHOT_BYTES` stays at **200 KB** — source files are a few KB each, so 40 of them fit comfortably, and keeping the cap tight is what protects the egress budget.

### Autosave: 5-second debounce, changed files only

Autosave fires **5 seconds after the last keystroke** (`AUTOSAVE_DEBOUNCE_MS`), plus an immediate flush on blur, `visibilitychange` and `beforeunload` so closing a tab never costs those 5 seconds.

A naive autosave would re-upload all 40 files because one character changed. The IndexedDB cache is what makes a real delta possible: it already holds the **last successfully synced content hash per path**, so the client can compute what changed without reading anything back from Supabase.

```js
// src/cache/autosave.js  — runs on the debounced tick
const eligible = tree.filter(f => !matchesAny(f.path, Limits.SYNC_IGNORE))
const synced   = await idb.get(`synced:${sessionId}`) ?? {}      // { path: contentHash }

const upsert = eligible.filter(f => hash(f.content) !== synced[f.path])
const remove = Object.keys(synced).filter(p => !eligible.some(f => f.path === p))
if (!upsert.length && !remove.length) return                      // nothing to do: no request at all

const { data } = await api.autosavePatch(sessionId, upsert, remove)
await idb.put(`synced:${sessionId}`, nextHashes(eligible))         // only after success
```

```sql
-- merges the delta into the single autosave row; the 200 KB cap still applies to the result
create function public.autosave_patch(p_session_id uuid, p_upsert jsonb, p_delete text[])
returns table (files_hash text)
language plpgsql security definer set search_path = '' as $$
  -- 1. upsert the autosave snapshot row for (session, auth.uid())
  -- 2. replace matching paths from p_upsert, drop paths in p_delete, keep the rest
  -- 3. the files_valid() + octet_length() constraints reject an oversized merged result
$$;
```

| Property | Why it holds |
|---|---|
| **A typo costs one file, not forty** | Only mismatched hashes are sent |
| **An unchanged tree costs no request at all** | The early return above — a student reading the brief sends nothing |
| **Hashes update only after a successful write** | A failed save keeps the old hashes, so the next tick retries the same delta. Nothing is silently dropped |
| **An evicted cache is safe** | Lost hashes mean one full re-upload, never lost work |
| **A new device is safe** | No hashes → full upload once, then deltas |
| **A 5 s debounce is safe here** | WebContainer plus IndexedDB keep the working copy locally across a refresh, so a longer debounce risks far less than it would have with the old in-memory editor |

> **Direction matters.** Autosave is an **upload** — ingress — and the 5 GB free-tier cap is on **egress**. Delta sync buys faster saves on lab wifi and less row churn; it is *not* what protects the egress budget. The `files_hash` read cache above is. Don't conflate the two when tuning.

### Dependency caching — build it only if the cold install hurts

**Decision deferred to measurement, deliberately.** The rule "no `node_modules` in storage" exists to protect the 5 GB Supabase egress budget, and for anything crossing the network it stays absolute. But IndexedDB is local: caching dependencies there costs **zero** Supabase egress.

So if Dylan's spike finds the cold `pnpm install` is slow enough to hurt — a stalled rejoin, or a stalled **Load checkpoint** when `package.json` changed between checkpoints — the fix is a local dependency cache:

```
first boot    → pnpm install → container.export('/node_modules') → IndexedDB
later boots   → IndexedDB → container.mount() → skip install entirely
invalidated by → hash of (package.json + pnpm-lock.yaml)
```

| | |
|---|---|
| **Build it if** | cold install > ~15 s, or catch-up regularly triggers a reinstall |
| **Skip it if** | installs are already fast (StackBlitz claims several times faster than local) |
| **Cost** | 50–120 MB of IndexedDB per dependency set — significant on a lab laptop with several lessons cached |
| **Eviction** | Same as any cache: a miss means a reinstall, never broken state |
| **Egress impact** | None. This is entirely local |

Until that measurement exists, we install on boot and keep the code path simple. The spike result goes in the README either way, so the decision is on record.

### Why there is no mock API any more

The old §2 existed because students had no server: lesson code calling `axios.get('http://localhost:3000/items')` had to be intercepted and answered from `lesson.mock_api`. WebContainer gives every student a real Node process, so lessons ship their own endpoint instead — Mini Cart runs a small Express server as a second process, with Vite proxying `/api` to it ([07](./07-seed-and-demo.md#seed-lesson-week-6--mini-cart-status-ready)).

That deletes the interception layer, the `mock_api` column's reason for existing, and the "unmatched localhost requests get a helpful 404" special case — and it teaches the real thing, which is the point of the course.
## 3. Session Lifecycle

Owner: **Ying Qi**. Four RPCs, all `security definer`, because each one decides something the client must not.

```sql
-- start_session: only a prof of this course, only a ready lesson, unique live code
create function public.start_session(p_lesson_id uuid) returns public.sessions
language plpgsql security definer set search_path = '' as $$
declare l public.lessons; s public.sessions; code text; tries int := 0;
begin
  select * into l from public.lessons where id = p_lesson_id;
  if not found then raise exception 'NOT_FOUND|Lesson not found' using errcode='P0001'; end if;
  if l.status <> 'ready' then
    raise exception 'CONFLICT|Mark the lesson ready first' using errcode='P0001';
  end if;
  if not public.is_course_prof(l.course_id) then
    raise exception 'FORBIDDEN|Only the course prof can start a class' using errcode='P0001';
  end if;
  loop
    tries := tries + 1;
    code := public.gen_join_code();                       -- shared alphabet, no 0/O/1/I/L
    begin
      insert into public.sessions (lesson_id, course_id, started_by, join_code)
      values (l.id, l.course_id, auth.uid(), code) returning * into s;
      exit;
    exception when unique_violation then
      if tries >= 5 then raise; end if;                   -- partial unique index on live codes
    end;
  end loop;
  return s;
end $$;
```

`join_session`, `save_checkpoint`, `catch_up`, `announce` and `end_session` follow the same shape — the step-by-step logic for each is in [04](./04-pages-routes-and-events.md#key-logic-rpc-bodies).

### Class announcements

The prof can post a short free-text announcement to the whole class — "taking a 5-minute break", "skip the cart for now, we'll come back to it". Everything else the prof broadcasts is a structured event; this is the one free-text channel, and it is deliberately **one-way, prof only, one at a time**:

```
rpc('announce', { p_session_id, p_text })     ← 1–200 chars, or null to clear
   ├─ update sessions.announcement = { text, at }
   └─ realtime.send('session:announce')
                │
   every student: AnnouncementBanner across the top of the workspace
   late joiner / reconnect: reads sessions.announcement on bootstrap
```

It is **stored, not just broadcast**, because a broadcast only reaches whoever is subscribed at that instant — a student who joins five minutes later, or whose laptop reconnects, would otherwise never see it. A new announcement replaces the old one; there is no history, because it is a classroom notice, not a chat. Dismissing the banner hides it until the next new announcement.

Rendered with Vue's normal escaping like every other user-entered string (T-VAL-05 covers it).

**Join codes** (`shared/join-code.js`, mirrored as `gen_join_code()` in SQL): 6 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` — no `0/O/1/I/L`, because students read these off a projector.

**Why the partial unique index matters:** `unique (join_code) where status = 'live'` lets a code be reused next term while guaranteeing only one live class answers to it. The retry loop exists because two profs can collide on a random code.

---

## 4. Status Classifier

### Client side (Dylan)

The workspace keeps `{ doneSeq, lastError }` (`stores/status.js`) and upserts its `student_status` row **only when one of them changes**, throttled to `STATUS_WRITE_THROTTLE_MS` (2 s). A heartbeat touches `last_seen_at` every 30 s while the tab is visible (`document.visibilityState`), and once straight away when the student comes back to the tab. No keystrokes, no code — the table has no column for either.

- **Opening the workspace** writes the row at once, which is the attendance record (`joined_at`). A refresh reads the row back first, so a Done stays done.
- **"My status"** in the workspace header is about the prof's **latest checkpoint**: *Done* sets `done_seq` to its number ("I've caught up to it"), *In progress* clears it. Before any checkpoint, Done means "I've got the starter code running" (`done_seq = 0`). When the prof saves a new checkpoint the toggle reads *In progress* again — nothing is written; the database just compares `done_seq` with the new `checkpoint_seq`.
- **Errors** go through `setError({ source, name, message, file, line })`, which adds `key` / `shapeKey` with `normalizeError()` and cuts the message to `ERROR_MESSAGE_MAX`; `clearError()` after a clean run. Nothing calls them yet: the lesson's `ca-probe.js` is still a placeholder, and build errors still need `parseBuildError()`.
- **After the class ends** the store stops writing (the table would refuse anyway).

### Derived in SQL (Andric)

This is the design change worth understanding. In the Mongo version the server classified and stored `state`. Here the student's own browser writes the row, so a stored `state` would be forgeable. **There is no `state` column** — `session_tiles` derives it, comparing the student's `done_seq` with the session's latest checkpoint, `checkpoint_seq` (0 before the first):

```sql
case
  when now() - last_seen_at > make_interval(secs => idle_after_sec) then 'idle'
  when error is not null                                            then 'error'
  when done_seq is not distinct from checkpoint_seq                  then 'done'
  else 'in_progress'
end
```

The full view is in [03-data-model.md](./03-data-model.md#views-session_tiles-and-session_summary). `shared/tile-state.js` holds the identical rule as `classify()` so the client can re-derive without a round-trip; **`tests/unit/tile-state.test.js` asserts both agree**, which is what stops the two drifting apart.

| Precedence | State | Colour | Icon | Meaning |
|:---:|---|---|---|---|
| 1 | `idle` | grey | `bi-moon` | No heartbeat or event for `idleAfterSec` (default 180 s) |
| 2 | `error` | red | `bi-x-octagon` | Last run threw — the most actionable state |
| 3 | `in_progress` | amber | `bi-pencil` | Still catching up to the latest checkpoint (everyone, right after the prof saves one) |
| 4 | `done` | green | `bi-check-circle` | Clicked Done on the latest checkpoint |

There is no `behind`: each checkpoint resets everyone, so how far behind someone is can't be counted — and doesn't need to be. The prof sees how many are still in progress on the current checkpoint.

### When re-classification happens

Derivation means most of this is now free — there is nothing to recompute and nothing to store.

| Trigger | What happens |
|---|---|
| Status change from a student | One row upserted → Postgres Changes → that tile re-reads the view |
| New checkpoint | `sessions.checkpoint_seq` moves → **every** Done tile drops back to in progress with zero extra writes (the old design needed a re-classify sweep over 40 students) |
| Idle threshold crossed | Nothing is written. The view compares `last_seen_at` to `now()`, so staff clients re-read on a 15 s timer |
| Settings change (`idleAfterSec`) | Same — the view reads `settings`, so it applies immediately |

### `status_history`

A trigger on `student_status` appends to `status_history` when the **derived** state changes, giving the insights funnel its raw material. Append-only rows replace the old 200-entry capped array.

### Dashboard summary

`session_summary` gives counts and `slow_down_count`; error groups are `groupErrors()` over the tile list in the staff browser, recomputed as a Vue `computed` and throttled to `SUMMARY_THROTTLE_MS` (1 s). There is no in-memory cache to rebuild after a restart, and no single-instance assumption — which also removes the old "scaling out would need a Redis adapter" caveat.

**Load target:** 40 simulated students updating every 3 s → p95 tile latency < 500 ms, checked with `scripts/simulate-class.js`. **This is also the Realtime free-tier check** — see the risk table in [02](./02-tech-stack.md#risks-specific-to-this-stack).

---

## 5. Lesson plans (removed)

Lessons used to carry an ordered list of steps, parsed from `// TODO 3:` comments in the starter files. They don't any more: a lesson is just its starter files, and **the prof saves a checkpoint whenever they like** during class, with an optional title (`rpc('save_checkpoint', { p_session_id, p_files, p_title })`). Each checkpoint resets every student to *In progress* until they click *Done* on it (§4). `shared/todo-parser.js`, the step editor and the `steps` table are gone. TODO comments can still sit in starter code as hints to students; nothing reads them.

---

## 6. Error Normalisation & Grouping (signature algorithm)

**Goal:** if 13 students hit "the same mistake", the prof sees **one** group of 13, not 13 different messages. Messages differ in volatile parts (line numbers, URLs, values), so we normalise before grouping.

`shared/error-normalizer.js` runs in the **student's** browser, before the status upsert, so `student_status.error` already carries `key` and `shapeKey`. Grouping runs in the **staff** browser over the tile list. Neither needs a server.

It now normalises **two** kinds of error. Runtime errors arrive from the probe as before. Build errors arrive from the dev server's output and must pass through `parseBuildError()` first, which strips the code frame (§1) — only then does `normalizeError()` see them. Both end up with the same `{ key, shapeKey }` shape, so grouping, Spotlight and the insights funnel need no changes.

Build errors group especially well: when nine students break the same `import`, Vite gives all nine a near-identical message, which is exactly the signal the prof wants. `error.source` (`'runtime'` or `'build'`) is carried through so the dashboard can label a group "won't compile" versus "throws at runtime".

### `normalizeError()`

```js
export function normalizeError({ name = 'Error', message = '' }) {
  let m = String(message).split('\n')[0].trim()
  m = m
    .replace(/(?:https?:\/\/|blob:|about:)\S+/g, '<url>')   // URLs
    .replace(/:\d+(?::\d+)?\b/g, '')                         // :line:col
    .replace(/\b\d+(?:\.\d+)?\b/g, '<n>')                     // numbers
    .replace(/\s+/g, ' ')
    .slice(0, 200)

  const key = `${name}: ${m}`                                 // level 1: exact mistake

  const shape = m
    .replace(/(['"`])(?:(?!\1).)*\1/g, '<str>')               // quoted identifiers/values
    .replace(/\b[\w$.]+(?= is not (?:defined|a function|iterable))/g, '<id>')
    .replace(/\(reading <str>\)/g, '(reading <prop>)')
  const shapeKey = `${name}: ${shape}`                        // level 2: same kind of mistake

  return { key, shapeKey }
}
```

### Examples

| Raw error (from different students) | `key` | `shapeKey` |
|---|---|---|
| `TypeError: Cannot read properties of undefined (reading 'items') at app.js:22:15` | `TypeError: Cannot read properties of undefined (reading 'items')` | `TypeError: Cannot read properties of undefined (reading <prop>)` |
| `ReferenceError: items is not defined` | `ReferenceError: items is not defined` | `ReferenceError: <id> is not defined` |
| `ReferenceError: itmes is not defined` | `ReferenceError: itmes is not defined` | `ReferenceError: <id> is not defined` |
| `AxiosError: Request failed with status code 404` | `AxiosError: Request failed with status code <n>` | same |

### Grouping rules

1. Group by `key`. The whole class is working towards the same checkpoint and follows the same code, so identifiers usually match — the exact key is the most useful label ("`items is not defined`" tells the prof exactly what to explain).
2. Groups that share a `shapeKey` are shown as **one group with variants** ("`<id> is not defined` — items ×9, itmes ×2").
3. Only groups with **≥ 2 students** (or ≥ 10% of those present, whichever is larger) appear.
4. Sort by student count desc, then most recent.
5. A student leaves a group as soon as their next run has no error.

> **Trust note.** A student's browser computes its own `key`. A malicious student could write a false error key into their own row — but it only affects their own tile and group membership, never anyone else's, and nothing in the privacy contract depends on it. Not worth a round-trip.

---

## 7. Catch-up & "What You Missed"

**Promise to the student:** loading the checkpoint never loses your work.

```
Student clicks "Load checkpoint"
  1. rpc('catch_up', { p_session_id, p_files })
       → inserts Snapshot { reason: 'before_catchup' } BEFORE returning anything
       → increments catch_ups
       → returns { checkpoint, attempt_snapshot_id }
  2. Client computes diffSummary(attemptFiles, checkpointFiles)    ← shared/diff-summary.js
  3. "What you missed" panel opens:
       • per file: lines you're missing (green) / lines that differ (red → green)
       • "First difference: app.js line 22 — you wrote `items`, checkpoint has `props.items`"
       • Optional: "What the class did since your last Done" = diff(the checkpoint you were Done on, latest)
  4. Editor loads the checkpoint files; tile re-derives on the next run
  5. "Restore my attempt" stays available (query snapshots where reason='before_catchup')
```

The ordering in step 1 is the whole guarantee, and it is now atomic: the snapshot insert and the checkpoint read are in one transaction, so there is no window in which the attempt is lost. T-CATCH-02 asserts it.

### Catching up may change the dependency tree

New with WebContainer, and the one place catch-up can stop feeling instant. Checkpoints store source files only, so if the prof added a dependency in checkpoint 5, loading that checkpoint brings a different `package.json` — and the student needs those packages before the project will run.

```
diff(attempt, checkpoint)
   │
   ├─ package.json / pnpm-lock.yaml unchanged  →  mount files, HMR picks them up   (instant)
   └─ dependency tree changed                  →  mount files, then pnpm install   (show an
                                                   explicit "installing dependencies" state,
                                                   streamed to the terminal — never a frozen UI)
```

So "Load checkpoint" has two speeds, and the slow one must be **visible and explained** rather than looking broken. This is also the strongest argument for the dependency cache in §2: with a local cache, the second path becomes a mount instead of an install.

`shared/diff-summary.js` uses jsdiff `diffLines` per file and returns `{ files: [{ path, added, removed, firstDiffLine, hunks }] }`. Whitespace-only changes are ignored (`ignoreWhitespace: true`) so indentation doesn't drown out the real mistake.

---

## 8. Help Queue & Telegram Ping

- **Check my work** (`type: 'check'`): TA opens the side-by-side view (student snapshot vs the checkpoint the class was on when they asked) and either **Pass** (student gets a tick for that checkpoint — shown on their tile too) or **Reply** with what's wrong.
- **Ask for help** (`type: 'help'`): same queue; if the student ticks "Come to my seat" (`in_person`) and enters a seat, staff get a Telegram ping.
- **Queue order:** oldest first (`created_at`). Each card shows live waiting time; requests waiting > 3 min get an amber badge.
- **Claiming** is a single conditional `update … where status = 'open'`. Zero rows updated **is** the conflict, so two TAs cannot take the same request — see `claim_help_request` in [03](./03-data-model.md#help_requests).
- **Who gets pinged:** staff of the course with Telegram linked. (The old design preferred staff currently in the staff socket room; with Realtime we could read Presence, but the function runs outside any channel — so it pings all linked staff of the course, which is simpler and no less correct.)

### When the reply doesn't fix it — follow-ups

Previously `replied` was terminal, so a student whose problem survived the TA's reply had to open a brand-new request: back of the queue, probably a different TA, and none of the context. Now they follow up on **the same request**:

```
replied ──[student: "still NaN after I changed it"]──▶ open
   • fresh snapshot of their CURRENT code attached (the reply usually prompted changes)
   • message appended to thread, alongside every earlier reply
   • claimed_by cleared → any TA can take it; card shows "Follow-up · last handled by Ana"
   • created_at untouched → it keeps its ORIGINAL place in the oldest-first queue
   • at most 3 follow-ups, then "ask for in-person help instead"
```

| Design point | Why |
|---|---|
| Same row, not a new one | The TA who picks it up sees the whole exchange in `HelpThread`, so the student never has to re-explain |
| Original queue place | It's the same unsolved problem, not a new one — sending it to the back would punish the student for the reply not landing |
| Fresh snapshot | The TA should review what the student has **now**, so the request points at the new copy. Earlier copies stay readable to staff, like any snapshot in their course |
| `thread` lives in the request row | No new table means no new RLS policy; the existing "own requests" and "staff read queue" policies already cover it |
| Cap of 3 | Keeps this a help mechanism rather than a chat feature. Past three rounds, walking over is faster for everyone |

`passed`, `resolved` and `cancelled` remain terminal — a passed check needs no follow-up, and in-person help was resolved face to face.

### How the ping fires

```
rpc('create_help_request')  → row committed
        │
        ▼ trigger on insert where in_person = true → pg_net (03, "In-person ping")
   telegram-notify (Edge Function)
        1. service role: read request + student name + checkpoint title + staff chat ids
        2. fetch Telegram sendMessage (HTML-escaped)
        3. update help_requests.telegram_notified_at
```

Because the row is **already committed** before the call is sent, a Telegram outage can never fail the student's action — the request exists, `telegram_notified_at` stays null, and the student sees "TA notified in app only". That used to need an explicit try/catch in the controller; it is now structural.

Example ping:

```
🙋 Help needed — IS216 G2 · Mini Cart
Alex Tan · Row C, seat 4
On: Checkpoint 4 · Emit add-to-cart
Open: https://<app>/help/66f1…
```

---

## 9. Spotlight Anonymisation

Spotlight projects **one** example of a common mistake next to the fix. It is an Edge Function, because it deliberately reads a student's code and must return it stripped of identity — exactly the kind of elevated read RLS should not grant a staff member directly.

1. The prof clicks **Spotlight** on an error group → `functions.invoke('spotlight', { sessionId, errorKey })`.
2. The function verifies the caller is the course prof, then uses the **service role** to pick the most recent `help_request` snapshot in that group — only code a student chose to send is eligible. No eligible snapshot → the prof sees "Nobody in this group has sent their code yet" and the Spotlight shows the error message + fix only.
3. Excerpt = the error's file, ±6 lines around the error line (`shared/spotlight.js`).
4. Anonymise: remove comments, replace the student's name/email (and any other enrolled student's name) with `Student`, cap at 30 lines.
5. Fix = the same region from the latest checkpoint.
6. The function writes `sessions.spotlight` and broadcasts `spotlight:show` to everyone; the student whose code it is gets no special marker.

> The excerpt builder is pure (`shared/spotlight.js`) so T-ERRG-07 can assert "no student names, no comments, ≤ 30 lines" without invoking a function.

---

## 10. Insights Report

Built by the `end-session` Edge Function, invoked by a Database Webhook when `sessions.status` becomes `ended`. It reads `status_history`, checkpoints and help requests with the service role, calls `shared/report-builder.js`, and writes one `session_reports` row. The report page polls until the row appears.

All figures are counts — no per-student detail is written, which is what makes T-INS-05 pass by construction.

For each checkpoint *k* (with `t_k` = when the prof saved it):

| Metric | Definition |
|---|---|
| `reachedDone` | Students who clicked Done on checkpoint *k* (a `done` history row with `checkpoint_seq = k`) |
| `dropOff` | `reachedDone(k-1) − reachedDone(k)` |
| `errorStudents` | Distinct students with any `error` state while checkpoint *k* was the latest |
| `medianMinutesToDone` | Median of (their Done on *k*) − `t_k` |
| `catchUps`, `helpRequests` | Counts while checkpoint *k* was the latest (help requests carry `checkpoint_seq`) |

**Trouble score** (shown with its formula, so profs can trust it):
`trouble_k = 0.4 × errorStudents/joined + 0.3 × dropOff/joined + 0.2 × catchUps/joined + 0.1 × helpRequests/joined`

The report highlights the top 3 checkpoints, the top 5 error groups and the peak "Slow down" count. Error groups come from `status_history.error_key` (the live `student_status` row keeps only the latest error); the peak comes from `session_slow_down_peak()` over `slow_down_events`.

**Trends across terms** (`rpc('lesson_trends')`): for every past session of the same lesson (or a lesson with the same title in a course with the same course code) **among the calling prof's own courses**, a checkpoint counts as *recurring trouble* if it was in the top 3 by trouble score in at least two sessions. Checkpoints are matched by normalised **title** (the prof tends to reuse them when teaching the same lesson), falling back to the number. Without lesson steps this is a heuristic: a prof who titles nothing, or saves checkpoints at different points each term, gets weaker trends. This is a SQL aggregate now rather than a JS loop over documents.

**Courses are per prof, so trends are too.** Two profs who both teach IS216 never see each other's sessions in their trends — the function filters on `courses.owner_id = auth.uid()` before matching anything. (Admins can still read every report row directly; they just don't get a cross-prof trends view.)

**Digest** (`functions.invoke('digest')`, content by Andric, sending by Karin):
- **To TAs:** attendance, top 3 trouble checkpoints, top errors, open help requests left.
- **To absent students** (enrolled, no `student_status` row for the session, Telegram linked): "You missed *Week 6 · Mini Cart*. Replay: <link>. Most classmates got stuck at checkpoint 4 — start there."

---

## 11. Replay & GitHub Import / Export

### Replay

The replay view queries `checkpoints` in `seq` order. For each, the client shows its title, the code with lines changed since the previous checkpoint highlighted (`diffSummary`, client-side), and a live preview (same sandbox as the workspace, read-only). Notes and bookmarks anchor to a `checkpoint_id`.

Search is `rpc('search')`: a ranked full-text query over checkpoint titles and the caller's own notes, using the GIN index on `notes.body`. Because it is a parameterised function, regex characters in the query are literal — no escaping to remember (T-REP-06).

### GitHub import (server token) — `github-import`

```
1. Parse https://github.com/<owner>/<repo>[/tree/<ref>/<dir>]
2. GET /repos/{owner}/{repo}                                  → default branch if no ref
3. GET /repos/{owner}/{repo}/git/trees/{ref}?recursive=1      → file list
4. Keep files under <dir> with .html .css .js .json .md, ≤ 20 files, ≤ 200 KB total
5. GET /repos/{owner}/{repo}/contents/{path}?ref={ref}        → base64 → text   (one per file)
6. Return files → the browser inserts the lesson
```

≈ 2 + n requests per import. `GITHUB_TOKEN` is a function secret and never reaches the browser.

### GitHub export (the student's own GitHub identity) — one commit per checkpoint

The old design hand-rolled OAuth and held the token in server memory for 10 minutes. Edge Functions are stateless per invocation, so that no longer works — instead we use **Supabase Auth's GitHub provider**:

```
1. Client: auth.linkIdentity({ provider: 'github', scopes: 'public_repo' })
2. Supabase completes the OAuth dance and puts provider_token on the session
3. Client: functions.invoke('github-export', { sessionId, repoName, private })
           with the provider token in the body
4. Function uses that token for the Git Data API calls below, and never stores it
```

```
1. POST /user/repos { name, private, auto_init: true }              → repo with README on main
2. GET  /repos/{o}/{r}/git/ref/heads/main                            → parentSha
3. For each checkpoint (seq order):
     POST /repos/{o}/{r}/git/trees  { tree: [README.md + checkpoint files as
                                      { path, mode: '100644', type: 'blob', content }] }
                                                                      → treeSha
     POST /repos/{o}/{r}/git/commits { message: "Checkpoint 3: Fetch items for the selected category",
                                       tree: treeSha, parents: [parentSha] } → parentSha = new sha
4. PATCH /repos/{o}/{r}/git/refs/heads/main { sha: parentSha }
5. Return https://github.com/{o}/{r}/commits/main
```

≈ 3 + 2 × checkpoints requests (19 for a class with 8 checkpoints). Trees are built **without** `base_tree`, so each commit contains exactly that checkpoint's files. The generated README lists each checkpoint with a link to its commit and, if the student opts in, their notes. Name already taken → 422 → the UI asks for another name.

> **Contract change worth flagging to the team.** The old rule was "the GitHub token lives only in server memory for 10 minutes and is never written to the database." The new rule: the token is held by Supabase Auth on the session and passed to the function per call — so it does reach the browser, which is weaker than before. We never persist it in our own tables, and T-GH-06 is rewritten to assert that: no GitHub token in any row we own.

---

## 12. Telegram Bot Integration

| Concern | Design |
|---|---|
| Linking | Profile → "Link Telegram" → `rpc('issue_telegram_link_code')` (10 min expiry) → deep link `https://t.me/<bot>?start=<code>` → the bot receives `/start <code>` → the function binds `telegram_chat_id` |
| **Receiving updates** | **Webhook**, not long polling. `setWebhook` once, pointing at the deployed `telegram-webhook` function. Edge Functions are request-scoped and cannot poll — and a webhook is the better design anyway |
| Webhook security | A public URL means anyone can POST to it. `setWebhook` is registered with `secret_token`, and the function rejects any request whose `X-Telegram-Bot-Api-Secret-Token` header does not match `TELEGRAM_WEBHOOK_SECRET` |
| One webhook per token | Local and deployed cannot both be registered. Use a separate dev bot, or register the deployed one only — the same constraint the old design had with two pollers |
| Sending | `sendMessage` with `parse_mode: 'HTML'`; all user text HTML-escaped |
| Rate limits | Outgoing queue, ≥ 50 ms between messages; on HTTP 429 wait `retry_after` and retry once |
| Failures | Never fail the user's action — the row is committed before the webhook fires; log, leave `telegram_notified_at` null, show "notified in app only" |
| Bot commands | `/start <code>` (link), `/stop` (unlink), `/help` |
| Tests | `EXTERNAL_APIS=mock` makes the functions append to `test_outbox` instead of calling out; E2E asserts on that table |

---

## 13. Stretch Goals (COULD)

| Stretch | Sketch | Owner |
|---|---|---|
| **Automatic checkpoint checks** | When the prof saves checkpoint *k*, generate checks from what changed since *k-1*: elements with new ids/classes (`dom-exists`), new mock-API calls seen when running the checkpoint in a hidden sandbox (`network-call`), "runs without errors" (`no-runtime-error`). The student's sandbox runs them after each run and writes `checks: { passed, total }` to their status row. The prof can switch any check off; failed checks show as "possible issue", never as a hard fail. | Dylan |
| **AI hints** | Rule table first (`shapeKey` → hint, e.g. `<id> is not defined` → "Check the spelling, or whether it was declared in this scope"). If `hintsEnabled` and `LLM_API_KEY` set, the `hint` function prompts with the checkpoint title, error and ±10 lines; instruction "one sentence, max 25 words, never give code". Output filter rejects code blocks or > 2 lines. Cached by `(session_id, checkpoint_seq, error_key)` in a table; daily cap of 200 calls. | Karin |
| **VS Code reporter** | A one-line `<script src="…/reporter.js" data-token="…">` in the starter code, with a per-student reporter token, writing the same status row through a dedicated Edge Function. | Ying Qi |

---

## External API Budget

Markers test each feature up to 5–6 times a day (FAQ 19).

| API | Free limit | Our worst case per day | Safe? |
|---|---|---|:---:|
| Telegram Bot API | Free; ~30 messages/s overall, ~20/min into one group | < 200 messages | ✅ |
| GitHub REST (function token, imports) | 5,000 requests/hour | 6 imports × ~25 requests = 150 | ✅ |
| GitHub REST (student identity, export) | 5,000 requests/hour per user | 6 exports × ~19 requests = 114 | ✅ |
| LLM (KIV) | Depends on provider | ≤ 200 calls (capped), most served from cache | ✅ with cap |
| **Supabase Realtime** | Free-tier concurrent connections + monthly messages | 40 students × a 3 s update for 5 min ≈ 4,000 messages per load test | ⚠️ **verify before Week 11** |
| **Supabase Postgres** | Free-tier storage + the project pauses when idle | Trivial storage; pausing is the real risk | ⚠️ **keep-alive required** — see [02](./02-tech-stack.md#risks-specific-to-this-stack) |

The last two rows are new and are the only places this architecture is *more* fragile than the Express one. The Realtime cap is Ying Qi's to verify (it is a run of her simulator); the idle pause is Andric's.
