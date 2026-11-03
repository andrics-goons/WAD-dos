---
name: report-issue
description: File a GitHub issue on andrics-goons/WAD-dos from a screenshot and a short summary. Derives the error description from the screenshot, assigns P0–P3 severity and an area label, and creates a plain-text issue. Use when the user invokes /report-issue.
---

# /report-issue

The user gives a screenshot of a problem plus a brief summary. Turn it into a plain-text GitHub issue on `andrics-goons/WAD-dos` and file it directly. Do not upload or link the screenshot; it is input only.

## Setup (once per teammate)

1. Install the GitHub CLI: `winget install GitHub.cli` (Windows) or `brew install gh` (Mac).
2. Open a **new** terminal and run `gh auth login` → GitHub.com → HTTPS → login with a web browser.
3. In Claude Code (started anywhere inside this repo), type `/report-issue <one-line summary>` and paste a screenshot.

The P0–P3 and `area:*` labels already exist on the repo. If `gh` isn't found on Windows, use `"/c/Program Files/GitHub CLI/gh.exe"`.

## Steps

1. **Read the screenshot.** Pull out the exact error text (console message, toast, stack frame, HTTP status), which page/view it is on, and what the UI state shows. Quote error text verbatim.
2. **Check the code.** Grep `codeAlong/` for the error text, column name, button label or route to confirm which file it comes from. If the screenshot shows UI that isn't on the current branch, say so in the issue and base it on the reporter's description.
3. **Check for duplicates.** `gh issue list -R andrics-goons/WAD-dos --state all --search "<key words from the error>"`. If a clear match exists, tell the user and ask whether to comment on it instead of filing a new one.
4. **Pick severity** (exactly one) using the rubric below. When torn between two levels, pick the higher one and say why.
5. **Pick area** (one, occasionally two) using the area map below. Add `bug` if something is broken, `enhancement` if it's a UX/feature request.
6. **Write the body** to a temp file using the template, then create the issue:
   ```
   gh issue create -R andrics-goons/WAD-dos --title "<title>" --body-file <tmp file> --label "<severity>" --label "<area>" --label "<bug|enhancement>"
   ```
7. **Reply** with the issue URL, the labels chosen, and one line of reasoning for the severity. Don't apply fixes (e.g. pushing migrations) without asking.

## Severity rubric

| Label | When |
|---|---|
| `P0-critical` | App crashes or white-screens, data loss/corruption, auth broken (can't log in / sees other users' data), or it blocks the demo's main flow. Fix immediately. |
| `P1-high` | A core feature is broken with no workaround (workspace won't run code, session won't join, lesson won't load). Fix before the next build/demo. |
| `P2-medium` | Broken but has a workaround, or a secondary feature is affected (replay glitch, help queue ordering, notification not sent). |
| `P3-low` | Cosmetic, layout, copy/typos, console warnings with no user-visible effect. |

Bump up one level if it affects something a first-time user hits on the happy path.

## Area map

| Label | Covers (codeAlong/) |
|---|---|
| `area:auth` | login, register, profile — `views/Login*`, `Register*`, `Profile*`, `api/auth.api.js`, `stores/auth.js` |
| `area:workspace` | editor, terminal, WebContainer — `views/WorkspaceView.vue`, `components/workspace`, `runtime/` |
| `area:session` | live sessions, joining, sync — `views/JoinView.vue`, `TeachView.vue`, `components/session`, `api/session*.api.js`, `runtime/sync.js` |
| `area:lessons` | courses, lessons, checkpoints — `views/Course*`, `Lesson*`, `EnrolView.vue`, `components/lesson`, `api/courses|lessons|checkpoints.api.js` |
| `area:help` | help queue and review — `views/Help*`, `components/help`, `supabase/functions/*-help` |
| `area:replay` | replays — `views/Replay*`, `components/replay`, `api/replays.api.js` |
| `area:dashboard` | home/dashboard/report — `views/HomeView.vue`, `ReportView.vue`, `components/dashboard`, `api/dashboard.api.js` |
| `area:integrations` | GitHub import/export, Telegram — `api/github|telegram.api.js`, `supabase/functions/github-*`, `telegram-*` |
| `area:admin` | admin pages — `views/AdminUsersView.vue`, `api/admin.api.js` |
| `area:ui` | styling, layout, shared UI components — `components/ui`, `styles/` |

## Title

`[<area short>] <what's broken, in plain words>`. Example: `[workspace] Terminal shows "ENOENT: package.json" after reload`.

## Body template (plain text / markdown, no images)

```
## Summary
<one or two sentences: what's broken, from the user's summary + screenshot>

## What was observed
- Page/view: <route or view name>
- Error: `<verbatim error text from the screenshot>`, or "none (UX issue)"
- <any other visible state worth noting>

## Likely cause
<only if step 2 found it: file:line, commit, missing migration, and the fix>

## Steps to reproduce
<inferred steps, or "Not known yet — reporter to add">

## Expected
<what should have happened>

## Severity: <P-level>
<one line on why this level>

_Filed via /report-issue_
```
