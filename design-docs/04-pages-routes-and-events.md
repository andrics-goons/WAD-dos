# CodeAlong — Pages, Data Access & Realtime

## Page Map

```
PUBLIC                         ANY LOGGED-IN USER                 STAFF (TA / PROF)
──────                         ──────────────────                 ─────────────────
Landing  /                     My courses        /courses         Teach view        /s/:id/teach   (prof)
Login    /login                Course page       /courses/:id     Help queue        /s/:id/help
Register /register             Join session      /join[/:code]    Help review       /help/:requestId
                               Enrol in course   /enrol[/:code]
404                            Student workspace /s/:id/code      Lesson editor     /lessons/:id/edit (prof)
                               Replays           /replays         New lesson        /courses/:id/lessons/new (prof)
                               Replay viewer     /replays/:id     Insights report   /sessions/:id/report
                               Profile           /profile
                               Home              /home

ADMIN
─────
Users    /admin/users
```

**Routes stay per course.** `/courses/:id` is the home of one prof's course: its **Lessons** tab holds the reusable plans, and each lesson has a dropdown listing every class started from it, live and past. Nothing in the app lists courses globally — a prof sees only their own, a student only those they enrolled in.

Routes are unchanged by the move to Supabase — the URLs are a UI contract, not a backend one.

---

## Client Pages

Each page lists its owner, who can open it, and how its layout responds. All pages share `AppNavbar` + `AppToast` from Ying Qi's UI kit.

| Path | View | Owner | Who | Layout: xs (375–575 px) → lg/xl (≥ 992 px) |
|---|---|---|---|---|
| `/` | `LandingView` | Ying Qi | Public (logged-in users go to `/home`) | Hero + 3 feature cards + "How it works" (4 steps) + footer, stacked → hero left, cards and steps in a row; "Join a class" CTA always visible. The navbar shows only "Join a class" and "Log in" until you log in |
| `/home` | `HomeView` | Ying Qi | Logged in | Where you land after logging in. "Live now" (live classes across your courses, with Open class / Help queue / Join by your role in that course) and 3 of your courses (the ones with a class live right now first, then newest first; "See all (n)" says how many there are when more than 3), stacked → 7 + 5 cols. Joining with a code is the navbar's "Join a class" |
| `/login`, `/register` | `LoginView`, `RegisterView` | Ying Qi | Public | Full-width card → centred card max 420 px |
| `/courses` | `CoursesView` | Ying Qi | Logged in | Course cards 1 col → 3 cols; prof sees "New course"; everyone can show and hide the courses they've archived. Each card, and each row of the archived list, has the same **⋯** menu (`CourseMenu`; **Restore** takes the place of Archive on an archived course): **Archive** (anyone, with a confirm), for a student **Leave course** (red; the same warning as on the course page, that their code and replays in it are deleted), and, for the owner, **Delete** (red, with a confirm) until a class has run in the course, after which it is greyed out with a **?** saying why (the list query counts each course's classes into `hasClasses`); student sees **"Enrol in a course"**, which opens `/enrol` |
| `/courses/:id` | `CourseView` | Ying Qi (shell) + Ray Yien (lesson library) | Staff / enrolled | Tabs (Lessons · People) → same tabs. Lessons has a search box and one folder per week ("Week 6", from `lessons.week`; "No week" if unset). A folder's dropdown lists its code files ("ICE", "Extra exercises"), each with its classes, and opens by default when one is live. Each file that isn't archived has its own **Start new session**, which starts a class from that file's code (a draft is made ready first), taught before or not; while one of its classes is live it shows **Open class** instead. Folders have no button. The prof's **⋯** on each file opens a small menu: **Edit files** (the lesson editor), **Visibility**, a row with a switch on the right (on = ready, students can see it; off = draft; saved as it's flipped, the menu stays open), and **Archive** (with a confirm), or **Unarchive** on an archived one; plus **Delete** (red, with a confirm) on a file no class has run from yet. Once one has, Delete is greyed out with a **?** beside it that gives the reason ("It's been taught, so it can't be deleted. Archive it instead."): on hover, or under the row when clicked. Anyone in the course can archive or restore it, for their own list only. A course you have archived is read-only for you until you restore it: its lessons, replays and reports stay open, but you cannot add or start lessons, edit the course, change its people, or join its live classes (they leave Home, and the live pages refuse to open with "Restore it from My courses"). The owner can also edit or delete it (Delete is disabled once it has classes, and the database refuses it too). On People, students see who is online in each live class; staff see the enrolment list, with a green dot beside each student who is online in a live class. **The owner sees a "Share enrolment" card**: the enrol code, a **Copy link** button for `<APP_URL>/enrol/<code>`, and its QR |
| `/enrol`, `/enrol/:code` | `EnrolView` | Andric | Students and TAs (redirects to login with `returnTo`) | Same 6-box code input as the join page; `/enrol/:code` pre-fills from the link or QR and auto-submits. Success → that course's page. **Joins a course once per term — not the same as `/join`, which joins one live class** |
| `/courses/:id/lessons/new` | `LessonNewView` | Evan (upload) + Ray Yien (GitHub import tab) | Prof | Stepper: 1 Source → 2 Review files. No plan to review: the prof saves checkpoints during class. With `?start=1&week=N`, the week is filled in and the last step marks the code ready, starts the class and opens the teach view (nothing links here with it since Start new session moved onto each file) |
| `/lessons/:id/edit` | `LessonEditView` | Evan | Prof | The starter files (file tree + editor) at every size, with Details in the header and one button under the files: **Continue** while nothing is edited, **Save and continue** once something is (it saves, then goes back to the course; if the save fails it stays, with the error). There is no Save button in the header. Visibility, archiving and deleting are in the lesson's ⋯ menu on the course page |
| `/join`, `/join/:code` | `JoinView` | Karin | Logged in (redirects to login with `returnTo`) | Big 6-box code input, auto-submits when complete; `/join/:code` pre-fills from QR |
| `/s/:id/teach` | `TeachView` | Evan (editor, live preview, checkpoints, dashboard, join code card) + Karin (announce input) | Prof | **xs:** dashboard-first (the class summary card); editor behind a tab. **xl:** editor 8 cols + terminal below; checkpoints card (optional title + **Save checkpoint**, any time, and the list saved so far) + one **"What the class is stuck on"** card 4 cols: Common errors (live from students' code) and **From help requests** (the AI summary, with its Refresh). Until there are help requests to show, Common errors leads and "No help requests yet" sits under it, with the same empty-state graphic as "No errors right now"; once there are, the help requests go first and Common errors under them; the **class summary cards** above the editor, in the editor's column: what students clicked, as numbers only — Done (of the students connected), Slow down, Asked for help, Check my work — no names on the cards; join code card collapsible. An **Announce** button (with its menu) and a **Present** button sit in the session bar at every size. A **Show students** toggle under the number cards opens a panel over the editor, as wide as it and as tall as the list up to about 21rem (then it scrolls), never past the editor's bottom (on phones it sits under the cards on the Dashboard tab): the students connected now by avatar and name, grouped by status, the groups side by side (Asked for help, Check my work, Error, In progress, Idle, Done; each student once, the most urgent first). Slow down is never shown per student |
| `/s/:id/code` | `WorkspaceView` | Dylan (+ Ray Yien's file tree and catch-up; Karin's announcement banner) | Enrolled student | **VS Code-style IDE** — see [the layout below](#the-workspace-is-an-ide). **xs:** tabs *Code · Preview · Terminal*, file tree in an offcanvas, sticky bottom bar with **Done**, **Slow down**, **Help**. **lg:** file tree rail + editor + preview, terminal docked under. The prof's current announcement shows as a dismissible banner across the top at every size. The header shows the latest checkpoint ("Checkpoint 3 · Added ItemCard") and one **Done** button: **Mark done** (grey) until the student is caught up to it, then a green **Done** that goes back to In progress when clicked again, and whenever the prof saves a new checkpoint. From xl an expand / split icon in the editor's and the preview's header swaps between side by side (split view) and one at a time (full view, that pane first), swapped by the eye / code button in each pane header as below xl; remembered on the device (`localStorage`), and the terminal and running preview survive the swap. Going full, the other pane folds away over 0.3 s while this one widens, like the Teach view's Present (`WorkspaceLayout`, shared with `/help/:id/code`). The file tree's width and the terminal's height can be dragged with the thin handles between the panes (double-click one for the default size); the sizes are kept on the device and never squeeze the editor below 320px wide or 120px tall. The same editor panel, and so the same handles, is in the Teach view. The terminal's header says "Packages ready" while the project's packages are installed (or put back from this device's last install), so `pnpm dev` can run without a `pnpm i` first, and "Run pnpm i" when they aren't (nothing for a project with no `package.json`). On a computer a file can be dragged onto a folder (or onto a file, meaning its folder) or the empty space under the tree (the top level) to move it there; it goes through the same checks as Rename, so a name already there shows an error under the tree instead, and folders don't drag. Dragging out a folder's last file first asks to confirm, since that folder disappears (a file goes back into it by renaming it to the full path). Moving or renaming a file that another file imports (an `import`, `require`, `new URL(…)`, an HTML `src`, or its path in a `.json` file) shows a warning toast naming those files, since their paths aren't updated |
| `/s/:id/help` | `HelpQueueView` | Karin | Staff | Queue cards 1 col → queue list left, selected request right (its top level with the first request, below the "Waiting" heading). "Waiting" (open + claimed, oldest first) above "Handled", whose heading folds the list away (the count stays on it, and the choice is remembered on the device). Below lg the list and the selected request take turns, with "Back to the queue". In the selected request the student's name is a link to that request's own page (`/help/:requestId`); on that page it is plain text. State lives in `stores/help.js`, kept live by the class channel |
| `/help/:requestId` | `HelpReviewView` | Karin | Staff | One request on its own page (the Telegram ping links here), same `HelpReviewPanel` as the queue (including the AI analysis of the request), with a link back to the queue. It has no Back button above it: its own **Help queue** button leads to the queue, and a Telegram link opens it with nothing behind it. Stacked thread + reply, then the diff (stacked on xs, side by side from sm; **Open in editor** beside its heading runs their code): the student's code against the checkpoint they were on, or against the lesson's starter code before the first checkpoint, so only the files they changed show |
| `/help/:requestId/code` | `HelpCodeView` | Karin | Staff | A TA's own runnable copy of a student's code, opened in a **new tab** from the review panel's **Open in editor** (so its WebContainer is its own and never touches the one in the tab it came from). The student's snapshot goes into the same editor, terminal and preview the student has (editor and preview side by side from xl, one at a time below it; from xl the same split / full view button and animation as the workspace, through the same `WorkspaceLayout`, remembered with the same key); the TA runs `pnpm i` then `pnpm dev` and can change anything. There is no Back button, since there is nothing behind it in that tab. Edits only reach this tab's WebContainer: nothing is saved or sent, and the student never sees it. A notice says so |
| `/replays` | `ReplayListView` | Ray Yien | Logged in | Search box on top, then one section per course. In it, one row per lesson ("3 classes · Week 6 · Mini Cart · Last 2 Nov"), in order of its newest class, closed at first like the Lessons tab's folders; opening it lists that lesson's classes, newest first (date · checkpoints), each linking to its replay |
| `/replays/:sessionId` | `ReplayView` | Ray Yien | Staff / enrolled | Timeline as horizontal scroller, code below, preview behind a tab → timeline left, code + preview right, notes drawer. **Download code** saves the open checkpoint as a .zip. Every student (not staff) also gets a **Teacher / Student** toggle: Student shows their own code as the class ended, or "No saved code" with a way back to the prof's code if they have none (read-only, with download, preview and export), with no timeline or notes, since notes belong to checkpoints. The centre has **Code / Preview** tabs (the preview starts by itself on screens from `md` up, so it's ready by the time you open its tab, which shows a spinner then a tick; while it loads the preview shows a progress bar, three steps (preparing, installing, starting) and the seconds so far — the install is counted from pnpm's output when it prints any, otherwise estimated from the time; smaller screens wait for **Run preview**; it keeps running while you look at the code), the checkpoint header has previous / next with "3 of 8", and `?view=student` keeps the toggle through a reload |
| `/sessions/:id/report` | `ReportView` | Evan (page) · Andric (report data) | Staff | Cards stacked; 2-col grid: per checkpoint, how many students loaded it (needed the prof's code), with the most challenging one(s) named; top errors and the digest panel beside it. Headline cards: attended, help requests (left open), slow-down peak. Not shown: recurring trouble across classes and the median TA wait (both still in the data) |
| `/welcome` | `ChooseRoleView` | Andric | A new GitHub account (`role_chosen = false`); the router sends them here from any page, with `returnTo` | Two big buttons, side by side from `sm` |
| `/profile` | `ProfileView` | Ying Qi (profile) + Karin (Telegram link card) | Logged in | Single column |
| `*` | `NotFoundView` | Ying Qi | Public | Friendly 404 with links back |
| `/admin/users` | `AdminUsersView` | Andric | Admin | Searchable user list → name, email, role dropdown, joined. Changing a role asks for confirmation. One Bootstrap list: each user stacks on xs and is a single row from lg. The admin's own role is locked |

### Route guards

`router/index.js` uses `meta: { auth: true, roles: ['prof'] }`. Unauthenticated → `/login?returnTo=<path>`. Wrong **account** role → toast "You don't have access to that page" and redirect to `/courses`.

**Admins pass every role check**, because they can read everything. On pages built for acting — the teach view, the help review — an admin sees the data with the action buttons disabled; the RPCs would refuse an admin's write anyway. `/admin/users` is `roles: ['admin']` only. *(The router's guards are currently switched off in code; this is the intended behaviour once they are restored.)*

**The guard is UX, not security.** Course-level membership is never checked in the client — RLS decides which rows exist, so a student who hand-navigates to another course's session gets an empty page and a "not found" state, not leaked data. Every view therefore needs a real empty/forbidden state, not just a spinner.

> **Deployment note:** these are history-mode routes on a static host. `vercel.json` must rewrite everything to `index.html`, or `/join/:code` from the QR code 404s. See [02](./02-tech-stack.md#deployment).

### The workspace is an IDE

`/s/:id/code` is the page the student spends the whole class in, and it now holds a real project rather than three files — so it is laid out like VS Code: tree on the left, open file beside it, preview and terminal alongside.

```
lg / xl ───────────────────────────────────────────────────────────────────
┌────────────┬──────────────────────────────┬─────────────────────────────┐
│ FILES      │ ItemCard.vue  ×  main.js  ×  │  PREVIEW                    │
│ ▸ src/     ├──────────────────────────────┤  (iframe → WebContainer     │
│   ItemCard │                              │   dev-server URL)           │
│   main.js  │   CodeMirror 6               │                             │
│ ▸ server/  │                              ├─────────────────────────────┤
│   api.js   │                              │  Checkpoint 4 · Done ✓      │
│ package.js │                              │                             │
├────────────┴──────────────────────────────┴─────────────────────────────┤
│ TERMINAL   pnpm install · pnpm dev output (local only, never sent)      │
└─────────────────────────────────────────────────────────────────────────┘

xs (375 px) ───────────────────────────────────────────
┌─────────────────────────────────────────┐
│ ☰ files   Code │ Preview │ Terminal │   ← tabs; ☰ opens the tree
├─────────────────────────────────────────┤      as an offcanvas drawer
│  active tab fills the viewport          │
├─────────────────────────────────────────┤
│  [ Done ]  [ Slow down ]  [ Help ]       │   ← sticky bottom bar
└─────────────────────────────────────────┘
```

| Rule | Why |
|---|---|
| The file tree is a **rail at lg+, an offcanvas drawer at xs** | A tree, an editor and a preview cannot coexist at 375 px. T-RESP-01 checks the drawer; T-RESP-05 still requires no horizontal page scroll anywhere |
| The terminal is **read-only output, and never leaves the browser** | It carries `pnpm install` and dev-server text, which can contain source lines. Nothing writes it to Postgres — see the privacy contract in [09](./09-integration-contracts.md#5-privacy-contract-our-unique-feature--every-pr-is-checked-against-this) |
| **Up to 3 terminals**, listed to the right of the one on screen | A backend and a frontend each hold a terminal while running, plus a spare for one-off commands. They share the one WebContainer, so the same files and ports. + adds one, the × on a row closes it and kills what's running there, and the last one can't be closed. Below md the list shows only the numbers |
| Boot and install have **explicit visible states** | "Starting your project…" → "Installing dependencies…" (streamed) → ready. A 20-second silent pause reads as broken, and this is the first thing a student sees on joining |
| Open files are tabs; the tree is the source of truth | `FileTabs` keeps its role, now driven by tree selection rather than a flat file list |
| Unsupported browser is a **message, not a blank pane** | Feature-detect `crossOriginIsolated`; Safari shows "The workspace needs Chrome or Edge" |

### UI rules that apply to every page (IDP / 10 rules of thumb)

| Rule | How we apply it |
|---|---|
| Visibility of system status | Saving indicator in the workspace |
| Match the real world | Labels say "Done", "Slow down", "Load checkpoint", "Check my work" — no jargon like "sync state" |
| User control & freedom | Load checkpoint always keeps your attempt (restorable); help requests can be cancelled |
| Consistency | Same tile colours, icons and labels everywhere (`StatusPill`); one button style per action type |
| Error prevention | Confirm modal before End session / Delete lesson; join code input only accepts valid characters |
| Recognition over recall | Join code and QR stay visible on the teach view; the latest checkpoint is pinned at the top of the workspace |
| Colour is never the only signal | Every tile state has an icon + text label as well as a colour |

---

## Data Access Catalog

There are no REST endpoints. Every row of this table is one of three things:

- **Query** — `supabase.from(…)` straight from the browser. RLS decides what comes back, so there is no auth code to write.
- **RPC** — a `security definer` Postgres function, for anything multi-step or anything the client must not decide (roles, join codes, sequence numbers, state transitions).
- **Function** — a Supabase Edge Function, for anything needing an API secret or elevated rights.

All of it goes through `src/api/*.api.js`; components never touch `supabase` directly.

### Auth & profile — `auth.api.js` (Andric), Telegram bits (Karin)

Call these through `stores/auth.js`: `register`, `login`, `logout`, `ensureLoaded`, `updateName(name)`, `changePassword({ currentPassword, newPassword })`, and for GitHub `signInWithGitHub(returnTo)`, `loadGitHub()` (fills `github` with `{ username, canDisconnect }` or `null`), `connectGitHub()`, `disconnectGitHub()`. `user.hasPassword` is false for an account made with GitHub, and the profile page then hides "Change password". The store subscribes to `onAuthChange` on its first `ensureLoaded()`: **a logout in another tab clears this tab and sends it from any `auth` page to `/login?returnTo=…`**.

| Kind | Call | What happens | Who |
|---|---|---|---|
| Auth | `auth.signUp({ email, password, options: { data: { name, role } } })` | Trigger creates the `profiles` row as `prof` if the user chose **Educator**, otherwise `student` — via an allow-list, since `role` comes from the browser | Any |
| Auth | `auth.signInWithPassword(…)` | Session stored by `supabase-js`; platform rate-limits | Any |
| Auth | `auth.signOut()` | Clears the local session | Any |
| Query | `auth.getUser()` + `from('profiles').select().eq('id', uid).single()` | Current user on app load | Any |
| Auth | `auth.signInWithOAuth({ provider: 'github', options: { redirectTo } })` — `signInWithGitHub(returnTo)` | **"Continue with GitHub"** on login and register. Leaves for GitHub and comes back to `returnTo` signed in; a first sign-in creates the account, named after the GitHub display name, else the username. GitHub sends no role, so the new account goes to `/welcome` first to pick one | Any |
| RPC | `choose_role(p_role)` — `chooseRole(role)` | `/welcome`: one click on **I'm a student** / **I'm an educator** sets the role, once (`CONFLICT` after that, or once in any course) | New GitHub account |
| RPC | `delete_my_account()` — `deleteAccount()` | Profile → **Delete account** (type DELETE to confirm): deletes the account and everything that would block it — a prof's courses with every lesson, class, replay and report in them — then signs out on this browser | Logged in |
| Auth | `auth.linkIdentity({ provider: 'github', options: { scopes: 'repo', redirectTo: '/profile' } })` — `connectGitHub()` | **"Connect GitHub"** on the profile page: links GitHub to the account I'm logged in with, with the repo access a replay export needs (05 §11). Needs manual linking on | Any |
| Auth | `auth.getUserIdentities()` / `auth.unlinkIdentity(github)` — `getGitHubLink()`, `disconnectGitHub()` | Shows "Connected as @username"; Disconnect is refused while GitHub is the only way to log in | Any |
| Query | `from('profiles').update({ name })` — `updateProfile({ name })` | Own row only (policy forbids changing `role`); 2–60 characters | Any |
| Auth | `signInWithPassword` with the current password, then `auth.updateUser({ password })` — `changePassword({ currentPassword, newPassword })` | The current password is checked first ("Your current password is wrong"); the new one must be ≥ 6 characters and different | Any |
| RPC | `issue_telegram_link_code()` | Writes a one-time code + expiry, returns `https://t.me/<bot>?start=<code>` | Any (Karin) |
| Query | `from('profiles').update({ telegram_chat_id: null })` | Unlink | Any (Karin) |

### Courses — `courses.api.js` (Andric)

Call these, not the queries below: `listCourses({ includeArchived })`, `getCourse(id)`, `createCourse({ code, title, term, section })`, `enrolWithCode(code)`, `updateCourse(id, changes)`, `setArchived(id, archived)`, `deleteCourse(id)`, `listStaff(courseId)`, `listStudents(courseId)`, `addStaff(courseId, email)`, `removeStaff(id, userId)`, `removeStudent(courseId, userId)`, `enrolUrl(code)`. Course rows come back with **`myRole`** (`'prof' | 'ta' | 'student'`) and **`isOwner`**, for choosing what to show — RLS still enforces everything. People rows are `{ user_id, name, role | enrolled_at }`. Errors are `AppError`s from `mapError`. The list of my courses lives in `stores/courses.js` (`load`, `create`, `enrol`, cleared on logout).

| Kind | Call | What happens | Who |
|---|---|---|---|
| Query | `from('courses').select('*')` | RLS returns exactly the courses I staff or am enrolled in — **no `$or` to write** | Any |
| RPC | `create_course(p_code, p_title, p_term, p_section)` | Creates the course **and** makes the caller its prof in one transaction; the server generates the enrol code. There is no insert policy on `courses` — a plain insert would leave the course invisible to its creator ([03](./03-data-model.md#why-there-is-no-insert-policy-on-courses)) | Prof |
| RPC | `enrol_with_code(p_code)` | Matches a course I cannot yet read (case-insensitive, not archived), inserts my `course_students` row; enrolling twice is harmless. Used by the enrol page for both the typed code and the `/enrol/:code` link | Student or TA (not in a course they staff) |
| Query | `from('courses').select().eq('id', id).single()` | Course; my role comes from the `course_staff`/`course_students` queries | Staff / enrolled |
| Query | `from('courses').update(…).eq('id', id)` | Owner policy | Owner |
| Query | `from('courses').delete().eq('id', id)` | FK cascades handle the rest. **`CONFLICT` once the course has any session** — offer Archive (`setArchived`) instead. Archiving is personal: the course ids sit in the user's own `user_metadata.archived_courses` (`auth.updateUser`), so it hides the course from that person's list only and the enrol code keeps working | Owner |
| RPC | `add_course_staff(p_course_id, p_email)` | Adds as TA, promoting `profiles.role` to `ta` if still `student`. Refuses someone already on staff or **currently enrolled as a student in this course** | Owner |
| Query | `from('course_staff').select('role, profiles(name)')` + same for students | People tab (names only) | Staff |
| RPC | `leave_course(p_course_id)` — `leaveCourse(id)` | Course page → **Leave course** (students only), with a warning that their code and replays in the course are deleted; then back to My courses | Student |
| RPC | `remove_course_staff(p_course_id, p_user_id)` — `removeStaff(id, userId)` | People → **Remove** on a TA (confirm first): they lose the course, their claimed help requests go back to the queue, and an account that TAs nowhere else is a student again | Owner |
| RPC | `remove_course_student(p_course_id, p_user_id)` | Removes enrolment; past statuses stay for the report | Owner |

### Lessons — `lessons.api.js` (Evan) + GitHub import (Ray Yien)

| Kind | Call | What happens | Who |
|---|---|---|---|
| Query | `from('lessons').select().eq('course_id', id).ilike('title', …)` | Lesson library search | Staff / enrolled |
| Query | `from('lessons').insert(…)` — `createLesson(courseId, details)` | Create a lesson from uploaded files, hidden from students (`draft`) so nothing uploaded by mistake reaches them; the Visibility switch in the lesson's ⋯ menu on the course page shows it (`ready`) | Prof |
| Function | `github-import` → `{ repoUrl, providerToken }` | Fetches files with the prof's own GitHub token → returns files; client then inserts. No token → `UNAUTHENTICATED` and the tab offers **Connect GitHub** | Prof (Ray Yien) |
| Query | `from('lessons').select('*, sessions(count)')` — `getLesson(id)` | Lesson with its files and whether it has been taught. Staff see every lesson; **enrolled students see non-draft lessons only**, including their starter `files` | Staff / enrolled |
| Query | `from('lessons').update(…)` | Title/description/week/files/entry_file/dev_command/status | Prof |
| Query | `from('lessons').delete().eq('id', id)` | Deletes the lesson. A trigger raises `CONFLICT` if the lesson was ever taught → UI offers Archive | Prof |

### Sessions & checkpoints — `sessions.api.js`, `checkpoints.api.js` (Ying Qi)

| Kind | Call | What happens | Who |
|---|---|---|---|
| RPC | `start_session(p_lesson_id)` | Validates `ready` + prof; returns the lesson's live class if it has one, otherwise allocates a unique join code and inserts; client renders the QR from `APP_URL/join/<code>` | Prof |
| RPC | `join_session(p_join_code)` | Finds the live session, decides my role (enrolling a student who isn't in the course yet), returns `{ session_id, role }` | Staff, students and TAs |
| Query | `from('sessions').select('*, lessons(title, files_hash, entry_file, dev_command)')` + latest checkpoint | Session bootstrap (`checkpoint_seq` is on the session row) | Member |
| Query | `from('sessions').update({ settings })` | Prof policy; a trigger broadcasts `session:settings` | Prof |
| RPC | `end_session(p_session_id)` | Sets `ended`, broadcasts `session:ended`; a trigger builds the report in the same transaction | Prof |
| RPC | `announce(p_session_id, p_text)` | Writes `sessions.announcement` and broadcasts `session:announce` to everyone; `p_text = null` clears it. Stored, not just broadcast, so late joiners see it | Prof |
| Query | `from('sessions').select().eq('course_id', id).order('started_at', { ascending: false })` | Past + live sessions | Staff / enrolled |
| RPC | `save_checkpoint(p_session_id, p_files, p_title)` | **Any time** while live. Allocates `seq`, stores the optional title, moves `sessions.checkpoint_seq` (every Done student goes back to in progress), broadcasts `checkpoint:new` | Prof |
| Query | `from('checkpoints').select().eq('session_id', id).order('seq')` | All checkpoints with files | Member |

### Dashboard — `dashboard.api.js` (Evan)

| Kind | Call | What happens | Who |
|---|---|---|---|
| Query | `from('session_tiles').select().eq('session_id', id)` | Tiles with state derived in SQL — **no code columns exist** | Staff |
| Query | `from('session_summary').select().eq('session_id', id).single()` | Counts + `slow_down_count` as an aggregate | Staff |
| Function | `summarize-help` → `{ sessionId }` | "What the class is stuck on": groups the open help requests' LLM analyses by step + category, then the LLM writes a title, explanation and teaching tip per group ([05 §8a](./05-core-logic.md#8a-help-request-analysis)). Runs on dashboard load and Refresh | Staff |
| Query | `from('lessons').select('id, files_hash')` then `files` only on a cache miss | The `files_hash` check that keeps repeat loads near-zero egress — see [05 §2](./05-core-logic.md#2-files-cache--dependencies) | Member |

> Error groups are **not** a server call. `groupErrors(tiles, …)` runs in the staff browser over the tile list — the same pure function, now client-side.

### Student workspace — `workspace.api.js` (Dylan: status and slow down · Ray Yien: files, autosave, catch-up)

| Kind | Call | What happens | Who |
|---|---|---|---|
| Query | `from('snapshots').select().eq('session_id', id).eq('reason','autosave').maybeSingle()` | My autosave; falls back to the session's starter files | Enrolled |
| RPC | `autosave_patch(p_session_id, p_upsert, p_delete)` | Autosave, debounced **5 s** after the last keystroke (plus a flush on blur/unload). Sends **only the files whose content hash changed**, diffed against IndexedDB; an unchanged tree sends no request at all. `SYNC_IGNORE` keeps `node_modules/`, `dist/` and `.vite/` out | Enrolled |
| — | `workspaceStore.loadLatestCheckpoint()` | **Catch-up, no RPC:** after the student confirms (and optionally downloads a .zip), loads the latest checkpoint through the file cache, replaces the editor and WebContainer files, and autosaves them. Disabled when there's no checkpoint, `allowCatchUp` is off, or the class has ended | Enrolled |
| Query | `from('snapshots').select().eq('reason','before_catchup')` | My attempts — RLS makes "mine" automatic | Enrolled |
| Query | `getMyStatus(sessionId)` / `saveStatus(sessionId, studentId, { doneSeq, error })` — `from('student_status').upsert(…)` | Status on change (throttled to 2 s) + 30 s heartbeat while the tab is visible; driven by `stores/status.js`. No `state` field exists to send | Enrolled |
| Query | `getMySlowDown(sid)`: my own `slow_down_flags` row → boolean; `setSlowDown(sid, me, on)`: `insert({ session_id, student_id })` / `.delete()` (a duplicate insert is ignored) | "Slow down" on / off, loaded with my status so it survives a reload. **Leaving the class page in-app takes it back** (`statusStore.leave()`); a closed tab, refresh or lost connection can't, so the database only counts students seen within the idle window (03). Clicking **Done** turns it off too (I've caught up), so forgotten flags don't keep the count high; turning it **on** while Done puts me back to In progress (I'm not caught up after all). Anonymous: staff can only read `slow_down_count` | Enrolled, live session |

### Help — `help.api.js` (Karin)

| Kind | Call | What happens | Who |
|---|---|---|---|
| RPC | `create_help_request(p_session_id, p_type, p_files, p_message, p_in_person, p_seat)` | Creates snapshot + request atomically, recording the class's latest checkpoint (`checkpoint_seq`) itself; partial unique index rejects a second active request of the same type; a Database Webhook fires `telegram-notify` when `in_person` | Enrolled |
| Query | `from('help_requests').select(…)` | Staff get the queue, a student gets their own — **the same query, split by RLS** | Member |
| Query | `from('help_requests').select('*, snapshots(files)').eq('id', id).single()` | Request + the code the student sent; the TA view then loads the checkpoint numbered `checkpoint_seq` | Staff, or the requesting student |
| RPC | `claim_help_request(p_request_id)` | `open → claimed` in one conditional update; zero rows updated raises `CONFLICT` | Staff |
| RPC | `transition_help_request(p_request_id, p_to, p_reply)` | release / pass / reply / resolve / cancel, with the transition table enforced server-side. A reply is **appended to `thread`**, so earlier replies survive a follow-up | Claiming staff, or the student for `cancel` |
| RPC | `follow_up_help_request(p_request_id, p_message, p_files)` | `replied → open` on the **same** request: attaches a fresh snapshot of the student's current code, appends the message to `thread`, clears `claimed_by`, keeps the original queue place. Max 3 per request | The requesting student |

### Replay, notes, search, export — `replays.api.js`, `notes.api.js` (Ray Yien)

| Kind | Call | What happens | Who |
|---|---|---|---|
| Query | `from('sessions').select().eq('status','ended')` | Ended sessions in my courses (RLS); attendance from my `student_status` row | Any |
| Query | `from('checkpoints').select('id, seq, title, files_hash, created_at').order('seq')` | Replay source; per-checkpoint diff stats computed client-side with `diffSummary` | Member |
| Query | `from('notes').select/insert/update/delete` | Own notes only. `user_id` defaults to the login, so don't send it | Author |
| RPC | `search(p_q, p_course_id)` | Full-text over checkpoint titles and my own notes, ranked; input is parameterised so regex characters are literal | Any |
| Auth | `auth.linkIdentity({ provider: 'github', scopes: 'repo' })` | Replaces the hand-rolled OAuth dance; Supabase holds the `provider_token` on the session | Any |
| Function | `github-export` → `{ sessionId, repoName, private }` | Creates the repo and one commit per checkpoint via the Git Data API | Member with a fresh GitHub identity |

### Admin — `admin.api.js` (Andric)

Call these: `listUsers()` and `setRole(userId, role)`. The list of users lives in `stores/admin.js`.

| Kind | Call | What happens | Who |
|---|---|---|---|
| RPC | `admin_list_users()` | Every account with email, role and joined date; emails come from `auth.users`, which only this definer function can join in | Admin |
| RPC | `admin_set_role(p_user_id, p_role)` | Changes another user's role; refuses the caller's own | Admin |
| Query | any table, via the normal pages | Admins read everything through one `admin reads all` policy per table — no separate admin copies of the pages | Admin |

### Reports & digests — `reports.api.js` (Andric; sending via Karin's function)

| Kind | Call | What happens | Who |
|---|---|---|---|
| Query | `getReport(id)`: the session (lesson title, course label), `session_reports.select().eq('session_id', id).maybeSingle()`, the class's `help_requests` (for `helpStats`: total, left open, median wait) and `rpc('is_course_prof')` | `report` is null only while the class is still live; `NOT_FOUND` if the session isn't yours to see | Staff |
| RPC | `lesson_trends(p_lesson_id)` | Checkpoints that trip students across sessions/terms (matched by title) — **only across the calling prof's own courses**, never another prof's | Staff |
| Function | `sendDigest(id)`: `functions.invoke('digest', { sessionId })` → `{ sent, failed, staff, absent }` | Telegrams the summary to the course's staff and "start here" to absent students; once per class | Prof |

### Hints (COULD) — Karin

| Kind | Call | What happens | Who |
|---|---|---|---|
| Function | `hint` → `{ sessionId, errorKey }` | Rule table first, LLM only if `hintsEnabled` and a key is set; cached by `(session, checkpoint, errorKey)` | Enrolled |

### Test-only

| What | How |
|---|---|
| Reset the database | `supabase db reset` — re-applies migrations + `seed.sql`. Replaces `POST /api/__test__/reset` |
| Inspect fake Telegram/GitHub traffic | `select * from test_outbox` with the service role key. Replaces `GET /api/__test__/outbox` |

> **What disappeared with Express:** route ordering rules (`/courses/enrol` before `/courses/:courseId`), `validateObjectId` middleware, `requireAuth`/`requireRole`, the `validate(schema)` layer, and the 66-row endpoint table this section used to be. What replaced them is one RLS policy set and 11 RPCs — strictly less code, and the authorization is no longer something a handler can forget.

---

## Key Logic (RPC bodies)

```
start_session  rpc('start_session', { p_lesson_id })
  1. Load lesson; NOT_FOUND if missing; CONFLICT unless status='ready'
  2. FORBIDDEN unless is_course_prof(lesson.course_id)
  3. If this lesson already has a live class, return it (Start class again never splits the students)
  4. Generate join code; retry on the partial unique clash (max 5)
  5. insert sessions { status: 'live' }
  6. return session   → client renders QR for `${APP_URL}/join/${code}`

join_session  rpc('join_session', { p_join_code })
  1. select ... where join_code = upper($1) and status = 'live'
     → NOT_FOUND 'No live class with that code'
  2. is_course_staff → 'staff';  is_enrolled → 'student';  else a student or TA (not into an archived course)
     is enrolled now → 'student';  anyone else (a prof or admin) → FORBIDDEN "You're not in this course"
  3. return { session_id, role }  → client goes to /s/:id/code or /s/:id/teach

save_checkpoint  rpc('save_checkpoint', { p_session_id, p_files, p_title })   ← any time
  1. session live (CONFLICT) + is_course_prof (FORBIDDEN); title ≤ 80 (VALIDATION_FAILED)
  2. lock the session row (select … for update), then seq = checkpoint_seq + 1;
     insert { seq, files, title: nullif(trim(p_title), '') }
  3. update sessions set checkpoint_seq = seq
     → every row of session_tiles re-derives: Done students go back to in_progress,
       with no extra writes
  4. realtime.send('session:<id>', 'checkpoint:new', payload)

create_help_request  rpc('create_help_request', …)
  1. is_enrolled + session live
  2. insert snapshots { reason: 'help_request' }, then help_requests { snapshot_id }
     → the partial unique index raises CONFLICT "You already have a request waiting"
  3. Staff see it via their postgres_changes subscription on help_requests (no code in the row)
  4. If in_person: a trigger calls `telegram-notify` through pg_net (03, "In-person ping")
     (a Telegram failure only clears telegram_notified_at and shows the student
      "TA notified in app only" — it never fails the request, because the row is
      already committed before the webhook fires)

follow_up_help_request  rpc('follow_up_help_request', { p_request_id, p_message, p_files })
  1. request belongs to auth.uid()                       → FORBIDDEN
  2. insert snapshots { reason: 'help_request' }         ← the student's code NOW
  3. update … where status='replied' and follow_ups < 3  → BAD_REQUEST past the cap
       status='open', claimed_by=null, snapshot_id=new, follow_ups+1, thread ||= message
     created_at untouched → it keeps its place in the oldest-first queue
  4. Staff see it re-enter the queue via postgres_changes, badged
     "Follow-up · last handled by Ana" (from the latest staff entry in thread)
  (If anything raises, the whole function rolls back — the snapshot from step 2 included.)

announce  rpc('announce', { p_session_id, p_text })
  1. is_course_prof + session live; 1–200 chars (or null to clear)
  2. update sessions set announcement = { text, at }  (or null)
  3. realtime.send('session:announce', { sessionId, text, at })

end_session  rpc('end_session', { p_session_id })
  1. is_course_prof; CONFLICT if already ended
  2. update status='ended', ended_at=now(); realtime.send('session:ended')
  3. The report_on_end trigger on that update runs build_session_report, which
     writes session_reports in the same transaction
```

---

## Realtime

Owner: **Ying Qi** (channels, subscriptions, auth); each feature owner owns the payload of their events. Names live in `shared/constants.js` as `RtEvent.*`.

One channel per session, `session:<sessionId>`, carrying all three mechanisms. Membership is enforced by RLS on `realtime.messages` (see [09](./09-integration-contracts.md#realtime-authorization)) — a student cannot subscribe to another course's session.

### Broadcast (server → everyone in the channel)

Sent only from RPCs and Edge Functions via `realtime.send()`. Clients subscribe; they never broadcast.

| Event | Payload | Owner |
|---|---|---|
| `checkpoint:new` | `{ sessionId, checkpointId, seq, title, filesHash, createdAt }` (`title` may be null) (files fetched on demand by `checkpointId`; `filesHash` lets the cache skip the download) | Ying Qi |
| `session:settings` | `{ sessionId, allowCatchUp, hintsEnabled }` | Ying Qi |
| `session:ended` | `{ sessionId, replayUrl }` — `replayUrl` is a path (`/replays/<id>`); the browser adds its own origin | Ying Qi |
| ~~`spotlight:show`~~ | — | Unused: Spotlight was dropped |
| ~~`spotlight:hide`~~ | — | Unused: Spotlight was dropped |
| `session:announce` | `{ sessionId, text, at }` — `text: null` clears | Karin |

### Postgres Changes (rows you are allowed to see)

| Subscription | Who | Effect |
|---|---|---|
| `student_status` filtered `session_id=eq.<id>` | Staff | Re-read that student's row from `session_tiles`; tile re-renders |
| `help_requests` filtered `session_id=eq.<id>` | Staff | Queue card appears or updates |
| `help_requests` filtered `student_id=eq.<me>` | Student | Sees the reply, or a tick when a check is passed |

RLS applies to subscriptions, so a student receives only their own rows — the old `user:<id>` room is unnecessary.

### Presence

Students track `{ userId, name }` on join; staff read it for the live attendance count. **The Teach view's numbers are about who is connected now:** "N connected" in the session bar, and on the dashboard "Done X of N" (and its bar) and Common errors count only connected students. A student who joined earlier and left drops out of all of them until they reconnect. Slow down (an anonymous count) and the help queue aren't filtered. `joined_at` is still written to `student_status` so the report survives after everyone disconnects. Presence is **not** used for idle — idle is `now() - last_seen_at > idleAfterSec`, derived in `session_tiles`.

### What used to be socket events

| Old Socket.IO | Now |
|---|---|
| `session:join` / `session:leave` + rooms | `channel.subscribe()` / `unsubscribe()`; RLS does the membership check |
| `status:update` (client → server, server classifies) | `upsert student_status` with raw signals; the **view** classifies |
| `heartbeat` | Same upsert, touching `last_seen_at` every 30 s while the tab is visible |
| `lost:toggle` | insert / delete my own `slow_down_flags` row |
| `dashboard:tile` | Postgres Changes on `student_status` |
| `dashboard:summary` | `session_summary` view + a Vue `computed`, throttled client-side to ≤ 1/s |
| `help:new` / `help:updated` | Postgres Changes on `help_requests` |

### Connection lifecycle

```
supabase-js connects with the Auth session → RLS applies to channel + row subscriptions
subscribe('session:<id>')  → broadcast + postgres_changes + presence, then read bootstrap rows
token refresh              → handled by supabase-js (realtime.setAuth)
disconnect                 → nothing is written; the view reports `idle` once last_seen_at ages out
reconnect (automatic)      → re-subscribe, re-read latest checkpoint and my own status
```

Edits continue locally throughout; autosave retries.

---

## Component Breakdown (key screens)

Unchanged — components never knew where the data came from, which is why this table survives the rewrite intact.

| Component | Props | Emits | Notes |
|---|---|---|---|
| `FileTree` | `filePaths`, `selectedFile` (v-model), `editable` | `update:selectedFile`, `create(path)`, `rename(from, to)`, `delete(path)` | Folders collapsible; `SYNC_IGNORE` paths hidden entirely. Browse-only unless `editable`; it only asks — the parent changes the files and confirms a delete. Names autosave can't store are refused in the tree |
| `CodeEditor` | `modelValue`, `language`, `errorLine`, `readOnly` | `update:modelValue`, `save` (Ctrl/⌘+S) | CodeMirror 6 wrapper; gutter marker on `errorLine`; `vue` mode for SFCs |
| `FileTabs` | `openPaths`, `activePath` | `select`, `close` | Open-file tabs, driven by `FileTree` selection |
| `PreviewFrame` | `previewUrl`, `runKey` | `console`, `runtime-error`, `network`, `ready` | `<iframe>` pointed at the WebContainer dev server — [05 §1](./05-core-logic.md#1-client-side-runtime-webcontainer) |
| `TerminalPanel` | `lines`, `busy` | — | New. Streams `pnpm install` / dev-server output. One per open terminal, each with its own shell; `EditorPanel` holds the list. **Output stays local** |
| `BootState` | `phase`, `progress` | `retry` | New. booting → installing → starting → ready, or a failure with the terminal tail |
| `ConsolePanel` | `entries` | `clear` | Filters: All · Errors · Network |
| `DoneButton` | `seq`, `disabled`, `passedByTa` | `done`, `undo` | "I've caught up to the latest checkpoint"; resets when a new one arrives |
| `ClassChoices` | `summary` | — | The teach view's class summary card: Done (n of total, with a bar), Slow down, Asked for help, Check my work, each with its own icon. Numbers only, no names |
| `StudentsByStatus` | `students` (`[{ id, name, state, help, check }]`) | — | The Teach view's students panel (under the number cards): connected students as avatar + name, grouped by status, most urgent first. A help request outranks a check request, which outranks the tile state. No Slow down |
| `ErrorGroupList` | `groups`, `waiting`, `need` | — | The Common errors section of the "What the class is stuck on" card (it goes in `HelpSummaryPanel`'s slot): one row per common mistake: count, title, its variants, "Won't compile" / "Throws at runtime". A mistake only shows once `need` students share it (2, or 10% of the class if more); `waiting` is the students whose error hasn't reached that, so an empty list says "No common errors yet · 1 student has an error, but a mistake shows here once 2 students share it" instead of "No errors right now", and next to groups a note counts the others |
| `HelpRequestCard` | `request`, `staffNames`, `myId`, `now`, `selected`, `canAct` | `claim`, `open` | Waiting time counts from the student's latest message (the opening one or a follow-up, so a follow-up isn't instantly "overdue"), ticking with the page's `now`; **Follow-up** badge + "last handled by …"; "Ana is on this" once claimed |
| `HelpReviewPanel` | `request`, `myId`, `canAct` | — | The TA's view of one request, used by both help pages: thread, Claim → Reply / Pass (checks only) / Resolved in person / Release, and the student's code diffed against the checkpoint the class was on when they asked. Reloads the code when a follow-up attaches a newer snapshot |
| `HelpStatusPill` | `status` | — | Waiting · Claimed · Passed · Replied · Resolved · Cancelled, icon + text (`help-status`) |
| `HelpThread` | `request` | — | New. Opening message, then every reply and follow-up in order. Shown to the student and to the reviewing TA |
| `HelpAnalysis` | `analysis` | — | The AI's read on a "help" request (05 §8a part 1), in the review panel between the student's message and the reply box, in the queue and on the request page: a summary, the why, the category, where they are stuck, the confidence, and a note that it can be wrong. It arrives a few seconds after the request and appears by itself over the live channel; nothing shows before then, and never for "Check my work". A failed analysis shows only "The AI couldn't analyse this one." (never the reason) |
| `FollowUpForm` | `request`, `remaining` | `submit` | New. Only on a `replied` request; shows "2 follow-ups left"; at 0, suggests in-person help |
| `CatchUpModal` | `open`, `checkpoint`, `busy` | `download`, `confirm` | "Load the prof's latest checkpoint?" Names the checkpoint, warns that anything not downloaded is lost, offers **Download my project (.zip)** (`btn-download-project`); confirm is **Replace my code** |
| `AnnouncementBanner` | `announcement` | `dismiss` | New. Top of the workspace; dismissing hides it until a **new** announcement arrives |
| `AnnounceInput` | `current` | `announce`, `clear` | New. In the teach view's session bar, beside the **Present** button (Present hides the dashboard, the right-hand panels and the phone tabs so the editor fills the page; the button then reads **Dashboard view** and brings them back; the editor stays mounted, so the code and the running app survive; it eases over 0.3s, with nothing unmounted, and is skipped for people who ask their system for reduced motion), as a single **Announce** button (while an announcement is showing to students it turns primary, with a tooltip saying so); its menu, like the ⋯ menus, holds the text box (Enter sends; closes on a click elsewhere or Escape), the 200-char counter and Send. While one is live, the top of the menu shows **"Showing to students now"** with its text and a labelled **Clear announcement** button (the only way to take it down), and the box below says "Or send a new one (it replaces this)". **Send** is disabled until there is text (an empty or blank announcement can't be sent); **Clear** shows only while students can see one, and is the only way to take it down |
| `SideBySideView` | `studentFiles`, `checkpointFiles` | — | Uses Ray Yien's `DiffView` |
| `DiffView` | `before`, `after`, `mode: 'split' \| 'unified'` | — | Unified forced on xs |
| `CheckpointTimeline` | `checkpoints`, `activeSeq` | `select` | Keyboard ← → navigation |
| `ReplayPreview` | `files` | — | Runs one checkpoint read-only in the shared WebContainer (its own `replay/` folder), only after **Run preview**. Moving to another step rewrites the files; a changed `package.json` reinstalls |

---

## Error Handling (what the user sees)

| Situation | What the user sees | Handling |
|---|---|---|
| Form validation fails | Message under each field; values kept | zod in `src/validators/` → form store (client-side, before the write) |
| Wrong login | "Invalid email or password" (never says which) | Supabase Auth error, mapped to a generic message |
| Picked the wrong account type at sign-up | Profile page explains the role can't be changed by the user, and who to contact | The update policy locks `role`; an admin fixes it in `/admin/users` |
| Not logged in on a protected page | Redirect to `/login?returnTo=…` | Router guard + an auth-state listener that clears the store on sign-out |
| Not allowed (e.g. student opens `/s/:id/teach`) | Toast + redirect to `/courses` | Router guard on account role |
| **Row exists but isn't mine** | Empty/forbidden state on the page, not a crash | RLS returns zero rows → `maybeSingle()` gives `null`. Every view needs this state |
| Wrong join code | "No live class with that code" under the input | `join_session` raises `NOT_FOUND\|…` |
| Wrong or archived enrol code | "No course with that code" under the input | `enrol_with_code` raises `NOT_FOUND\|…` |
| Enrol link opened while logged out | Sent to log in (or register), then straight back to the enrol link, which completes | `returnTo` carried through **both** login and register — a new student following the link usually has no account yet |
| Session ended while coding | Banner "Class ended — your work is saved. Open replay" | `session:ended` broadcast |
| Realtime disconnected | Edits continue locally; autosave retries | Channel state callback; supabase-js reconnects with backoff |
| Autosave fails | "Not saved — retrying" next to the file name; never blocks typing | Exponential retry; work kept in memory |
| Saving indicator | `save-status` next to the file name: "Saved", "Unsaved changes" (waiting out the 5 s), "Saving…", or a "Not saved — …" warning (retrying, project too large, refused) / "Class ended — no longer saving" | autosave's `onStatus`, kept in the workspace store as `saveStatus` |
| Help already claimed by another TA | Toast "Ana is already on this one" and the card updates | `claim_help_request` raises `CONFLICT\|…`; the card updates from Postgres Changes |
| Reply didn't fix it | Student sees **Follow up** on the replied request, with "2 follow-ups left" | `follow_up_help_request`; the same request returns to the queue in its original place |
| Follow-up limit reached | "You've followed up 3 times — ask for in-person help instead" | `BAD_REQUEST\|…` from the RPC |
| Prof posts an announcement | Banner across the top of every student's workspace; late joiners see it too | `session:announce` broadcast + `sessions.announcement` on bootstrap |
| Telegram / GitHub down | Feature-specific message ("Couldn't reach GitHub — try again in a minute"); rest of app works | Edge Function returns `UPSTREAM_UNAVAILABLE`; the row was already committed |
| Payload too large | "That's too much code to save — remove a file" | `octet_length` check constraint → mapped to `PAYLOAD_TOO_LARGE`; `MAX_FILES` is 40 |
| **Project won't start** | "Your project didn't start" + the last terminal lines + Retry | No `server-ready` within `BOOT_TIMEOUT_MS` |
| **Install is slow** | "Installing dependencies…" with streamed output, never a frozen pane | Expected on first boot, and after a checkpoint that changed `package.json` |
| **Code won't compile** | Error in the console panel and the editor gutter; the tile turns red with `source: 'build'` | Dev-server output → `parseBuildError()` (code frame stripped) → `normalizeError()` |
| **Browser can't run the workspace** | "The workspace needs Chrome or Edge" | `crossOriginIsolated` is false (Safari, or missing COOP/COEP headers) |
| Unknown route | Friendly 404 page | Vue catch-all route (plus the `vercel.json` rewrite so the server doesn't 404 first) |
| Unexpected failure | Toast "Something went wrong" | `mapError()` returns `INTERNAL`; details logged to the console, never shown |
