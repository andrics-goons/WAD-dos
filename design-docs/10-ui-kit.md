# CodeAlong — UI Kit Guide (for teammates and their AI assistants)

> Owner: **Ying Qi**. This is the contract for how every page in CodeAlong looks and responds.
> If you are an AI assistant building a page for this project, **follow this document exactly**. When something you need isn't covered here, stop and say so rather than inventing a new style.
>
> Live reference: run `pnpm dev` and open **http://localhost:5173/_kit**. It renders every token, class and component listed below.

---

## 1. The one-paragraph summary

The app uses **two styling layers with separate jobs**:

| Layer | Job | Examples |
|---|---|---|
| **Bootstrap 5 (pre-built CSS only)** | **Layout and responsiveness**: grid, breakpoints, flex, spacing, show/hide, text alignment | `row g-3`, `col-12 col-md-6`, `d-flex gap-2`, `d-none d-md-block`, `mb-3`, `text-center`, `text-truncate`, `visually-hidden` |
| **Our plain CSS (`ca-` classes + `--ca-` tokens)** | **The look**: colours, buttons, inputs, panels, typography | `ca-btn ca-btn--primary`, `ca-input`, `ca-card`, `var(--ca-brand)` |


Light pages for the app; **dark surfaces for the IDE** (workspace, teach view), switched on with one wrapper.

---

## 2. Where things live

```
codeAlong/
├── shared/constants.js            ← enums (TileState, Role, Limits…) — import from '@shared/constants.js'
└── src/
    ├── main.js                    ← imports fonts, Bootstrap CSS, Bootstrap Icons, then styles/main.css
    ├── App.vue                    ← app shell: <AppNavbar> + <main><RouterView/></main> + <AppToast>
    ├── styles/
    │   ├── main.css               ← imports the four files below, in order
    │   ├── tokens.css             ← ALL colours, fonts, spacing, radii, shadows, z-index (+ dark .ca-ide values)
    │   ├── base.css               ← points Bootstrap's own variables at our tokens; base element styles
    │   ├── components.css         ← .ca-btn, .ca-field/.ca-label/.ca-input, .ca-card, .ca-surface
    │   └── layout.css             ← .ca-page, .ca-page-header, .ca-fill-viewport, .ca-eyebrow, .ca-mono
    ├── components/ui/
    │   ├── AppNavbar.vue          ← top bar (already mounted — never render it yourself)
    │   ├── AppToast.vue           ← toast stack (already mounted — use the toast store)
    │   ├── ConfirmModal.vue       ← confirm before destructive actions
    │   ├── EmptyState.vue         ← empty / not-found / no-access screens
    │   ├── StatusPill.vue         ← the 5 tile states (done, in_progress, error, behind, idle)
    │   ├── JoinCodeInput.vue      ← the 6-box join code input
    │   └── tileStates.js          ← label + icon per tile state
    ├── stores/toast.js            ← useToastStore().show(text, variant)
    └── views/KitView.vue          ← the /_kit style guide page
```

All global CSS is already loaded by `main.js`. **Never import Bootstrap, fonts or our CSS files again** in a component.

---

## 3. Hard rules (do / don't)

**Do**
- Use **Bootstrap utilities for layout**: `row`/`col-*`, `d-flex`, `gap-*`, `m*-*`/`p*-*`, `d-none d-md-block`, `align-items-center`, `justify-content-between`, `text-truncate`, `h-100`, `w-100`.
- Use **`ca-` classes for anything with a look**: buttons, inputs, cards and panels.
- In `<style scoped>`, use **only `var(--ca-…)` tokens** for colours, spacing, radii, shadows and fonts.
- Write the **xs (phone) layout first**, then add breakpoint classes for larger screens.
- Give every interactive element a **`data-testid`** (convention: `design-docs/09-integration-contracts.md` §9).
- Show **icon + text** for any status. Colour is never the only signal.
- Every data view needs **loading, empty, and error states**. RLS returns zero rows (not an error) for data you can't see, so "empty" must be handled.

**Don't**
- ❌ Hard-code a hex/rgb colour in a component (`color: #4f46e5`). Use a token. If a token is missing, ask Ying Qi to add one.
- ❌ Use Bootstrap's `btn btn-primary` or `form-control`. Use `ca-btn ca-btn--primary` and `ca-input`. (A stray Bootstrap one won't look broken, but it won't match.)
- ❌ Use Bootstrap JavaScript components (`data-bs-toggle`, `new bootstrap.Modal`). Use Vue state, and `ConfirmModal` for dialogs.
- ❌ Add global CSS or new files to `src/styles/`. Use Bootstrap utilities and the kit classes first; if a page truly needs its own CSS, keep it to a few lines in that component's `<style scoped>`.
- ❌ Load Google Fonts or any CDN stylesheet. The COOP/COEP headers WebContainer needs block cross-origin fonts. Fonts are self-hosted already.
- ❌ Render your own navbar, toast, or modal backdrop.
- ❌ Use inline styles — no `style="…"` and no `:style`. To colour something by a student's state, use the `ca-state--<state>` classes (see StatusPill below).
- ❌ Use `!important`, or fixed pixel widths that break at 375px.

---

## 4. Page templates

### 4a. A normal page (courses, lesson library, help queue, replay list, report, profile…)

```vue
<script setup>
import { onMounted, ref } from 'vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { useToastStore } from '@/stores/toast'

const toast = useToastStore()
const loading = ref(true)
const error = ref(null)
const courses = ref([])

onMounted(async () => {
  try {
    // courses.value = await coursesStore.load()   ← via your Pinia store, never supabase directly
  } catch (e) {
    error.value = e
    toast.show('Could not load your courses', 'danger')
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="ca-page">
    <!-- Title row: heading left, actions right; wraps at xs -->
    <div class="ca-page-header">
      <div>
        <div class="ca-eyebrow">AY2026/27 T1</div>
        <h1>My courses</h1>
      </div>
      <button class="ca-btn ca-btn--primary" data-testid="btn-new-course">
        <i class="bi bi-plus-lg" aria-hidden="true" />New course
      </button>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="d-flex justify-content-center py-5">
      <span class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading…</span></span>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="ca-surface">
      <EmptyState icon="bi-exclamation-triangle" title="Something went wrong">
        Please refresh the page.
      </EmptyState>
    </div>

    <!-- Empty (also what a user sees for rows RLS hides from them) -->
    <div v-else-if="!courses.length" class="ca-surface">
      <EmptyState icon="bi-journal" title="No courses yet">
        Enrol with the code your prof gave you.
        <template #actions>
          <button class="ca-btn ca-btn--primary" data-testid="btn-enrol">Enrol with code</button>
        </template>
      </EmptyState>
    </div>

    <!-- Content: 1 column at xs, 2 from md, 3 from xl -->
    <div v-else class="row g-3">
      <div v-for="c in courses" :key="c.id" class="col-12 col-md-6 col-xl-4">
        <RouterLink :to="`/courses/${c.id}`" class="ca-card h-100 d-block text-reset text-decoration-none"
                    :data-testid="`course-card-${c.code}`">
          <div class="ca-eyebrow mb-1">{{ c.code }} · {{ c.section }}</div>
          <h3 class="mb-1">{{ c.title }}</h3>
          <p class="text-body-secondary small mb-0">{{ c.term }}</p>
        </RouterLink>
      </div>
    </div>
  </div>
</template>
```

### 4b. An IDE page (workspace `/s/:id/code`, teach view `/s/:id/teach`)

```vue
<template>
  <!-- Full height under the navbar, dark palette for everything inside -->
  <div class="ca-ide ca-fill-viewport d-flex flex-column" data-bs-theme="dark">
    <div class="d-flex align-items-center gap-2 px-3 py-2 border-bottom">
      <span class="fw-semibold text-truncate">Step 4 · Emit add-to-cart</span>
      <StatusPill state="error" size="sm" class="ms-auto" />
      <button class="ca-btn ca-btn--primary ca-btn--sm" data-testid="btn-load-checkpoint">Load checkpoint</button>
    </div>

    <!-- lg and up: panes side by side · below lg: one pane at a time (tabs) -->
    <div class="flex-grow-1 d-flex overflow-hidden">
      <aside class="d-none d-lg-block border-end">…file tree…</aside>
      <section class="flex-grow-1">…editor…</section>
      <section class="d-none d-lg-block border-start">…preview…</section>
    </div>
  </div>
</template>
```

**Both** `class="ca-ide"` **and** `data-bs-theme="dark"` are required:
- `ca-ide` flips our `--ca-` tokens to their dark values, so `ca-btn`, `ca-input`, `ca-card`, `StatusPill` and `EmptyState` go dark.
- `data-bs-theme="dark"` makes Bootstrap's own pieces (`btn-close`, `form-switch`, `border`, `text-body-secondary`) go dark.

Inside a `ca-ide` region, keep using the same `var(--ca-surface)`, `var(--ca-text)` and other tokens. **Don't write separate dark colours.**

---

## 5. Responsive design: breakpoints

Bootstrap's breakpoints. A class with an infix applies **from that width upwards**.

| Breakpoint | From | Infix | Example | Test widths |
|---|---|---|---|---|
| **xs** | 0 | *(none)* | `col-12`, `d-none`, `flex-column` | **375px**, **575px** (demo width) |
| **sm** | 576px | `-sm-` | `col-sm-6`, `flex-sm-row` | 600px |
| **md** | 768px | `-md-` | `col-md-6`, `d-md-block`, `d-md-none` | 800px |
| **lg** | 992px | `-lg-` | `col-lg-4`, `d-lg-flex` | 1024px |
| **xl** | 1200px | `-xl-` | `col-xl-3` | 1280px |
| **xxl** | 1400px | `-xxl-` | `col-xxl-2` | 1440px |

Patterns:
- **Grid of cards that change at chosen breakpoints:** `row g-3` + `col-12 col-sm-6 col-lg-4`.
- **Lots of small cards, a fixed number per row:** `row row-cols-2 row-cols-md-4 g-2`, with each card in a `<div class="col">`.
- **Hide below md:** `d-none d-md-block`. **Show only below md:** `d-md-none`.
- **Stack at xs, row from sm:** `d-flex flex-column flex-sm-row gap-2`.
- In `<style scoped>`, media queries must use these exact pixel values, mobile-first, because CSS variables can't be used inside `@media`:
  ```css
  .my-panel { padding: var(--ca-space-3); }
  @media (min-width: 768px) { .my-panel { padding: var(--ca-space-5); } }   /* md and up */
  ```

**Responsive requirement (rubric + tests):** no page may scroll horizontally at 375px (`T-RESP-05`). Wide content (tables, diffs, code) goes in its own scroll container: `<div class="table-responsive">` or `overflow-x: auto`.

**How to test:** Chrome DevTools → Ctrl+Shift+M → "Responsive" → type widths just below and above each breakpoint (575/576, 767/768, 991/992, 1199/1200, 1399/1400). `/_kit` shows a live "Current breakpoint" badge you can compare against.

---

## 6. Class reference (`ca-`)

### Buttons: `components.css`

```html
<button class="ca-btn ca-btn--primary">Save checkpoint</button>
```

| Class | Use for |
|---|---|
| `ca-btn` | **Always required.** On its own = the secondary (white, bordered) look |
| `ca-btn--primary` | The single main action on a screen |
| `ca-btn--secondary` | Alternatives, Cancel |
| `ca-btn--success` | Positive completion (Done, Pass) |
| `ca-btn--warning` | "I'm lost" style attention actions |
| `ca-btn--danger` | Destructive. **Always behind a `ConfirmModal`** |
| `ca-btn--ghost` | Toolbar and icon buttons with no border |
| `ca-btn--link` | Looks like a link, behaves like a button |
| `ca-btn--sm` / `ca-btn--lg` | Size |
| `ca-btn--block` | Full width |
| `ca-btn--icon` | Square icon-only button. **Needs `aria-label`** |

- Icons go inside with no extra spacing class (the button has a gap): `<i class="bi bi-plus-lg" aria-hidden="true" />New`.
- Loading: `<button class="ca-btn ca-btn--primary" :disabled="saving"><span v-if="saving" class="spinner-border spinner-border-sm" aria-hidden="true" />Save</button>`.
- `<RouterLink class="ca-btn ca-btn--primary">` works too.
- **How it works:** `.ca-btn` defines four settings (`--btn-bg`, `--btn-bg-hover`, `--btn-fg`, `--btn-border`) and its styles only read them; each variant just changes the settings. To make a one-off coloured button in a scoped style, set the settings rather than `background`:
  ```css
  .my-special-btn { --btn-bg: var(--ca-info); --btn-bg-hover: var(--ca-info); --btn-fg: var(--ca-on-brand); --btn-border: transparent; }
  ```

### Form fields: `components.css`

```html
<div class="ca-field">
  <label class="ca-label" for="email">Email</label>
  <input id="email" v-model="email" type="email" class="ca-input"
         :class="{ 'ca-input--invalid': errors.email }" data-testid="input-email" />
  <p v-if="errors.email" class="ca-field-error">{{ errors.email }}</p>
  <p v-else class="ca-field-hint">Use your school email</p>
</div>
```

| Class | Use for |
|---|---|
| `ca-field` | Wrapper: stacks label, input and message with even spacing. Can share an element with a Bootstrap `col-*` |
| `ca-label` | Field label (always pair with `for`/`id`) |
| `ca-input` | `<input>`, `<select>` and `<textarea>` |
| `ca-field-hint` | Small grey helper text |
| `ca-field-error` | Red error text (zod message) |

- **Invalid state comes from the `ca-input--invalid` class** (red border, red focus ring), not Bootstrap's `is-invalid`.
- Multi-column forms: `<div class="row g-3"><div class="col-12 col-sm-6 ca-field">…</div>…</div>`.
- Toggle: Bootstrap's switch (already brand-coloured):
  `<div class="form-check form-switch"><input id="x" class="form-check-input" type="checkbox" role="switch" v-model="on"><label class="form-check-label" for="x">Allow catch-up</label></div>`.

### Panels & layout: `components.css`, `layout.css`

| Class | Use for |
|---|---|
| `ca-page` | **Wrapper for every non-IDE page.** Centred, max width 1320px, side gutters |
| `ca-page-header` | Title row: `<h1>` left, actions right; wraps at xs |
| `ca-eyebrow` | Small uppercase label above a heading |
| `ca-card` | White panel **with** padding (course cards, report cards, forms) |
| `ca-surface` | White panel **without** padding (wraps lists, tables, EmptyState) |
| `ca-fill-viewport` | Full height below the navbar (IDE pages) |
| `ca-ide` | Dark IDE region (pair with `data-bs-theme="dark"`) |
| `ca-mono` | Monospace text (join codes, file names, inline code-ish values) |

Headings: `h1` 32px, `h2` 24px, `h3` 18px, `h4`–`h6` 16px, all semibold. One `<h1>` per page.
Muted text: Bootstrap's `text-body-secondary`. Small text: `small`.

### Icons

Bootstrap Icons: `<i class="bi bi-check-circle-fill" aria-hidden="true" />`. Browse at https://icons.getbootstrap.com. Decorative icons get `aria-hidden="true"`; an icon-only button gets `aria-label`.

---

## 7. Tokens (`tokens.css`)

Use as `var(--ca-…)` in `<style scoped>`. Values change inside `.ca-ide` automatically.

| Group | Tokens |
|---|---|
| Brand | `--ca-brand` (indigo), `--ca-brand-hover`, `--ca-brand-active`, `--ca-brand-subtle` (tinted bg), `--ca-brand-ring` (focus), `--ca-on-brand` (text on brand), `--ca-link` |
| Semantic | `--ca-success`, `--ca-danger`, `--ca-warning`, `--ca-info` (+ `-hover` for success/danger/warning), `--ca-on-warning` |
| Surfaces & text | `--ca-bg` (page), `--ca-surface` (panels), `--ca-surface-muted` (hover/stripes), `--ca-border`, `--ca-border-strong` (inputs), `--ca-text`, `--ca-text-muted`, `--ca-backdrop` |
| IDE palette | `--ca-ide-bg`, `--ca-ide-surface`, `--ca-ide-raised`, `--ca-ide-border`, `--ca-ide-text`, `--ca-ide-muted`, `--ca-ide-accent` |
| Tile states | `--ca-state-<state>` (solid), `--ca-state-<state>-bg` (fill), `--ca-state-<state>-fg` (text on fill), for `done`, `in_progress`, `error`, `behind`, `idle`. Names match `TileState` values, so `` `var(--ca-state-${tile.state})` `` works |
| Type | `--ca-font-sans` (Inter), `--ca-font-mono` (JetBrains Mono), `--ca-text-xs` 12 · `-sm` 14 · `-base` 16 · `-lg` 18 · `-xl` 24 · `-2xl` 32 px |
| Spacing | `--ca-space-1` 4 · `-2` 8 · `-3` 12 · `-4` 16 · `-5` 24 · `-6` 32 · `-7` 48 px |
| Shape | `--ca-radius-sm`, `--ca-radius`, `--ca-radius-lg`, `--ca-radius-pill`, `--ca-shadow-sm`, `--ca-shadow`, `--ca-shadow-lg` |
| Layout | `--ca-navbar-height` (56px), `--ca-content-max` (1320px) |
| Stacking | `--ca-z-navbar` 1030, `--ca-z-drawer` 1045, `--ca-z-modal` 1055, `--ca-z-toast` 1090 (same scale as Bootstrap) |

Example scoped style:

```css
.tile {
  padding: var(--ca-space-3);
  border: 1px solid var(--ca-border);
  border-left: 4px solid var(--ca-state-error);
  border-radius: var(--ca-radius);
  background: var(--ca-surface);
}
.tile:hover { background: var(--ca-surface-muted); }
@media (min-width: 992px) { .tile { padding: var(--ca-space-4); } }   /* lg and up */
```

---

## 8. Shared components

### `StatusPill`: show a tile state anywhere

```vue
<StatusPill :state="tile.state" />                       <!-- icon + "Error" -->
<StatusPill :state="tile.state" size="sm" />             <!-- compact -->
<StatusPill state="done" label="Step 4 · Done" />         <!-- custom label -->
```
Props: `state` (required, a `TileState` value), `size` (`'md'` default | `'sm'`), `label` (override text). Renders `data-state="<state>"`. Need the label/icon elsewhere (e.g. a filter chip)? `import { tileStateMeta } from '@/components/ui/tileStates.js'` → `{ label, icon }`.

**Colouring anything by state** (a dashboard tile, a chart bar): add the class `ca-state--done` (or `in_progress`, `error`, `behind`, `idle`) and use `var(--state)`, `var(--state-bg)` and `var(--state-fg)` in your scoped CSS — e.g. `` :class="`ca-state--${tile.state}`" `` with `.tile { border: 2px solid var(--state); background: var(--state-bg); }`.

### `JoinCodeInput`: typing a join code

```vue
<JoinCodeInput v-model="code" :invalid="!!error" :disabled="joining" @complete="join" />
```
Six boxes, one character each. Letters are capitalised as you type, and keys that can't be in a code (`0`, `O`, `1`, `I`, `L`, symbols) are ignored, so the value is always clean — pass it straight to `join_session`. The cursor moves on as you type; Backspace steps back; pasting a code fills every box. Emits `complete` (with the code) once all six are filled, for auto-submit. Setting `v-model` from outside (e.g. `/join/:code` from a QR link) fills the boxes. Test id: `input-join-code` on the group.

### `EmptyState`: empty, not found, no access, error

```vue
<EmptyState icon="bi-journal-x" title="No lessons yet" compact>
  Import starter code to create your first lesson.
  <template #actions><button class="ca-btn ca-btn--primary">New lesson</button></template>
</EmptyState>
```
Props: `icon` (Bootstrap Icons class, default `bi-inbox`), `title` (required), `compact` (less padding, for inside panels). Slots: default (description), `actions` (buttons). Put it inside a `ca-surface` on normal pages.

### `ConfirmModal`: before anything destructive

```vue
<script setup>
const confirmEnd = ref(false)
const ending = ref(false)
async function endSession() {
  ending.value = true
  try { await sessionStore.end() ; confirmEnd.value = false } finally { ending.value = false }
}
</script>

<button class="ca-btn ca-btn--danger" data-testid="btn-end-session" @click="confirmEnd = true">End session</button>
<ConfirmModal v-model:open="confirmEnd" title="End this class?" confirm-label="End session"
              variant="danger" :busy="ending" @confirm="endSession">
  Students will see "Class ended" and their work is saved.
</ConfirmModal>
```
Props: `open` (use `v-model:open`), `title` (required), `confirmLabel`, `cancelLabel`, `variant` (`'primary'` | `'danger'`), `busy` (spinner + locks buttons). Emits `confirm`, `cancel`. **It does not close itself on confirm.** Set `open` to false when your action succeeds. Escape and backdrop click cancel (unless busy). Danger variant focuses Cancel first. In tests, find it with `getByRole('dialog')` and its buttons by name.

### Toasts: the toast store

```js
import { useToastStore } from '@/stores/toast'
const toast = useToastStore()
toast.show('Checkpoint saved', 'success')
toast.show('Ana is already on this one', 'danger', { title: 'Already claimed' })
toast.show('Reconnecting…', 'warning', { timeout: 0 })   // 0 = stays until dismissed; returns an id
toast.dismiss(id)
```
Variants: `'info'` (default), `'success'`, `'warning'`, `'danger'`. Auto-dismiss after 4s; max 4 on screen. In tests, find them with `getByRole('status')` (or `getByRole('alert')` for danger).

### `AppNavbar`: don't render it

Mounted once in `App.vue`. It has a `#status` slot for live indicators (e.g. Karin's `ConnectionPill`); to add something there, ask Ying Qi to wire it in `App.vue`. Test ids (from doc 09): `nav-courses`, `nav-replays`, `nav-profile`; the rest are found by role, e.g. `getByRole('button', { name: 'Toggle navigation' })`.

### Shared constants

```js
import { TileState, TileStateOrder, HelpStatus, Limits } from '@shared/constants.js'
```
Never hard-code `'in_progress'` or `200` when a constant exists. This file is a team contract (`09-integration-contracts.md` §1); ping the team before changing it.

---

## 9. Accessibility checklist (part of "usable" in the rubric)

- Every input has a `<label for>`; an invalid input gets `ca-input--invalid` and its message in `ca-field-error`.
- Icon-only buttons have `aria-label`; decorative icons have `aria-hidden="true"`.
- Status is never colour-only: use `StatusPill` or icon + text.
- Don't remove focus outlines. The kit already shows an indigo focus ring on keyboard focus.
- Use real `<button>` for actions and `<RouterLink>`/`<a>` for navigation.

---

## 10. Before you open a PR (UI part of the Definition of Done)

- [ ] Page wrapped in `ca-page` (or `ca-ide ca-fill-viewport` + `data-bs-theme="dark"` for IDE pages)
- [ ] No hex/rgb colours, no Bootstrap `btn`/`form-control`, no Bootstrap JS, no new global CSS
- [ ] Loading, empty and error states exist (EmptyState for empty/forbidden)
- [ ] Works at **375px** and **1280px** with no horizontal scroll; checked each breakpoint the page uses
- [ ] `data-testid` on every interactive element
- [ ] Destructive actions go through `ConfirmModal`; feedback through `toast.show`
- [ ] Screenshots at 375px and 1280px in the PR

Need a new token, button variant or shared component? Ask Ying Qi rather than adding a one-off. If two pages need it, it belongs in the kit.
