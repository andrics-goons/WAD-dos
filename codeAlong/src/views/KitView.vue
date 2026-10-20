<script setup>
import { ref } from 'vue'
import { TileStateOrder } from '@shared/constants.js'
import { useToastStore } from '@/stores/toast'
import StatusPill from '@/components/ui/StatusPill.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ConfirmModal from '@/components/ui/ConfirmModal.vue'

// Living style guide for the team — open /_kit. Owner: Ying Qi.
// If you need something that isn't here, ask before inventing a one-off style.
const toast = useToastStore()
const confirmOpen = ref(false)
const confirmBusy = ref(false)
const email = ref('')
const password = ref('short')

const brand = [
  { name: 'Brand', token: '--ca-brand' },
  { name: 'Brand hover', token: '--ca-brand-hover' },
  { name: 'Brand subtle', token: '--ca-brand-subtle' },
]
const semantic = [
  { name: 'Success', token: '--ca-success' },
  { name: 'Danger', token: '--ca-danger' },
  { name: 'Warning', token: '--ca-warning' },
  { name: 'Info', token: '--ca-info' },
]
const surfaces = [
  { name: 'Page bg', token: '--ca-bg' },
  { name: 'Surface', token: '--ca-surface' },
  { name: 'Surface muted', token: '--ca-surface-muted' },
  { name: 'Border', token: '--ca-border' },
  { name: 'Text', token: '--ca-text' },
  { name: 'Text muted', token: '--ca-text-muted' },
]
const ide = [
  { name: 'IDE bg', token: '--ca-ide-bg' },
  { name: 'IDE surface', token: '--ca-ide-surface' },
  { name: 'IDE raised', token: '--ca-ide-raised' },
  { name: 'IDE border', token: '--ca-ide-border' },
  { name: 'IDE text', token: '--ca-ide-text' },
  { name: 'IDE accent', token: '--ca-ide-accent' },
]

function fakeConfirm() {
  confirmBusy.value = true
  setTimeout(() => {
    confirmBusy.value = false
    confirmOpen.value = false
    toast.show('Session ended', 'success')
  }, 900)
}
</script>

<template>
  <div class="ca-page">
    <div class="ca-page-header">
      <div>
        <div class="ca-eyebrow">Team reference</div>
        <h1>CodeAlong UI kit</h1>
      </div>
      <a class="ca-btn ca-btn--secondary ca-btn--sm" href="#ide">Jump to IDE surfaces</a>
    </div>

    <div class="kit-lede text-body-secondary">
      <p class="mb-2">
        <strong class="text-body">Bootstrap</strong> for layout and responsiveness — grid, breakpoints, spacing:
        <code>row</code>, <code>col-md-6</code>, <code>d-flex gap-2</code>, <code>d-none d-md-block</code>.
      </p>
      <p class="mb-0">
        <strong class="text-body">Our <code>ca-</code> classes</strong> for the look — buttons, inputs, panels — and
        <code>var(--ca-…)</code> tokens in <code>&lt;style scoped&gt;</code>. Never hard-code a hex colour; tokens live in
        <code>src/styles/tokens.css</code>.
      </p>
    </div>

    <!-- ── Colour ──────────────────────────────────────────────────────── -->
    <section class="kit-section">
      <h2>Colour</h2>
      <div v-for="group in [brand, semantic, surfaces]" :key="group[0].token" class="ca-grid kit-swatches">
        <div v-for="s in group" :key="s.token">
          <div class="kit-chip" :style="{ background: `var(${s.token})` }" />
          <div class="small fw-semibold">{{ s.name }}</div>
          <code class="small">{{ s.token }}</code>
        </div>
      </div>
    </section>

    <!-- ── Tile states ─────────────────────────────────────────────────── -->
    <section class="kit-section">
      <h2>Tile states</h2>
      <p class="text-body-secondary small">
        <code>&lt;StatusPill :state="tile.state" /&gt;</code> — always icon + label + colour. Tokens:
        <code>--ca-state-&lt;state&gt;</code>, <code>-bg</code>, <code>-fg</code>.
      </p>
      <div class="d-flex flex-wrap gap-2 mb-2">
        <StatusPill v-for="s in TileStateOrder" :key="s" :state="s" />
      </div>
      <div class="d-flex flex-wrap gap-2">
        <StatusPill v-for="s in TileStateOrder" :key="s" :state="s" size="sm" />
      </div>
    </section>

    <!-- ── Responsive layout ───────────────────────────────────────────── -->
    <section class="kit-section">
      <h2>Responsive layout (Bootstrap breakpoints)</h2>
      <p class="text-body-secondary small">
        Layouts change at breakpoints, not at device names. Write the <strong>xs</strong> layout first, then add a class
        for the breakpoint where it should change — it applies from that width <em>upwards</em>.
      </p>

      <!-- Live indicator: exactly one badge is visible at any width -->
      <div class="d-flex align-items-center gap-2 mb-3" data-testid="kit-breakpoint">
        <span class="small text-body-secondary">Current breakpoint:</span>
        <span class="badge text-bg-primary d-sm-none">xs · &lt; 576px</span>
        <span class="badge text-bg-primary d-none d-sm-inline d-md-none">sm · ≥ 576px</span>
        <span class="badge text-bg-primary d-none d-md-inline d-lg-none">md · ≥ 768px</span>
        <span class="badge text-bg-primary d-none d-lg-inline d-xl-none">lg · ≥ 992px</span>
        <span class="badge text-bg-primary d-none d-xl-inline d-xxl-none">xl · ≥ 1200px</span>
        <span class="badge text-bg-primary d-none d-xxl-inline">xxl · ≥ 1400px</span>
      </div>

      <div class="table-responsive mb-4">
        <table class="table table-sm small align-middle mb-0">
          <thead>
            <tr><th>Breakpoint</th><th>From</th><th>Class infix</th><th>Test at</th></tr>
          </thead>
          <tbody>
            <tr><td>xs</td><td>0</td><td><em>none</em> — <code>col-12</code>, <code>d-none</code></td><td>375px and 575px</td></tr>
            <tr><td>sm</td><td>576px</td><td><code>-sm-</code> — <code>col-sm-6</code></td><td>600px</td></tr>
            <tr><td>md</td><td>768px</td><td><code>-md-</code> — <code>d-md-flex</code></td><td>800px</td></tr>
            <tr><td>lg</td><td>992px</td><td><code>-lg-</code> — <code>col-lg-4</code></td><td>1024px</td></tr>
            <tr><td>xl</td><td>1200px</td><td><code>-xl-</code> — <code>col-xl-3</code></td><td>1280px</td></tr>
            <tr><td>xxl</td><td>1400px</td><td><code>-xxl-</code> — <code>col-xxl-2</code></td><td>1440px</td></tr>
          </tbody>
        </table>
      </div>

      <p class="text-body-secondary small">
        Page layout: <code>row g-3</code> + <code>col-12 col-sm-6 col-lg-4 col-xxl-3</code> → 1 column at xs, 2 from sm,
        3 from lg, 4 from xxl. Resize the window to see it.
      </p>
      <div class="row g-3 mb-4">
        <div v-for="n in 4" :key="n" class="col-12 col-sm-6 col-lg-4 col-xxl-3">
          <div class="ca-card h-100">
            <div class="ca-eyebrow mb-1">IS216 · G{{ n }}</div>
            <h3 class="mb-1">Web Application Development II</h3>
            <p class="text-body-secondary small mb-0">AY2026/27 T1</p>
          </div>
        </div>
      </div>
      <p class="text-body-secondary small">
        Card lists: <code>&lt;div class="ca-grid" style="--min: 12rem"&gt;</code> — as many columns as fit, no breakpoint
        classes needed. Show/hide from a breakpoint up: <code>d-none d-md-block</code> (hidden below md),
        <code>d-md-none</code> (only below md).
      </p>
      <div class="ca-grid" style="--min: 9rem; --gap: var(--ca-space-2)">
        <div v-for="n in 8" :key="n" class="ca-surface p-3 small">Tile {{ n }}</div>
      </div>
    </section>

    <!-- ── Type ────────────────────────────────────────────────────────── -->
    <section class="kit-section">
      <h2>Typography</h2>
      <div class="ca-card">
        <div class="ca-eyebrow mb-1">.ca-eyebrow</div>
        <h1>h1 — Week 6 · Mini Cart</h1>
        <h2>h2 — Step 4 of 8</h2>
        <h3 class="mb-3">h3 — Emit add-to-cart</h3>
        <p class="mb-1">Body text in Inter. Students read join codes like <strong>ABC234</strong> off a projector.</p>
        <p class="text-body-secondary mb-2">Muted text uses <code>.text-body-secondary</code>.</p>
        <span class="ca-mono">.ca-mono · const items = props.items</span>
      </div>
    </section>

    <!-- ── Buttons ─────────────────────────────────────────────────────── -->
    <section class="kit-section">
      <h2>Buttons</h2>
      <p class="text-body-secondary small">
        <code>ca-btn ca-btn--primary</code> for the main action on a screen, <code>--secondary</code> for alternatives,
        <code>--danger</code> only for destructive actions (behind a ConfirmModal).
      </p>
      <div class="d-flex flex-wrap gap-2 mb-2">
        <button class="ca-btn ca-btn--primary">Save checkpoint</button>
        <button class="ca-btn ca-btn--secondary">Cancel</button>
        <button class="ca-btn ca-btn--success"><i class="bi bi-check-lg" />Done</button>
        <button class="ca-btn ca-btn--warning">I'm lost</button>
        <button class="ca-btn ca-btn--danger">End session</button>
        <button class="ca-btn ca-btn--ghost">Ghost</button>
        <button class="ca-btn ca-btn--link">Link</button>
        <button class="ca-btn ca-btn--primary" disabled>Disabled</button>
      </div>
      <div class="d-flex flex-wrap align-items-center gap-2">
        <button class="ca-btn ca-btn--primary ca-btn--sm">--sm</button>
        <button class="ca-btn ca-btn--primary ca-btn--lg">--lg Join a class</button>
        <button class="ca-btn ca-btn--secondary ca-btn--icon" aria-label="Settings"><i class="bi bi-gear" /></button>
        <button class="ca-btn ca-btn--primary" disabled>
          <span class="spinner-border spinner-border-sm" aria-hidden="true" />Saving…
        </button>
      </div>
    </section>

    <!-- ── Forms ───────────────────────────────────────────────────────── -->
    <section class="kit-section">
      <h2>Forms</h2>
      <p class="text-body-secondary small">
        <code>ca-field</code> + <code>ca-label</code> + <code>ca-input</code>; errors via <code>ca-input--invalid</code> and
        <code>ca-field-error</code>. Toggles use Bootstrap's <code>form-check form-switch</code>.
      </p>
      <form class="ca-card" novalidate @submit.prevent>
        <div class="row g-3">
          <div class="col-12 col-sm-6 ca-field">
            <label class="ca-label" for="kit-email">Email</label>
            <input id="kit-email" v-model="email" type="email" class="ca-input" placeholder="alex@codealong.test" />
            <p class="ca-field-hint">Use your school email</p>
          </div>
          <div class="col-12 col-sm-6 ca-field">
            <label class="ca-label" for="kit-pw">Password</label>
            <input
              id="kit-pw"
              v-model="password"
              type="password"
              class="ca-input ca-input--invalid"
            />
            <p class="ca-field-error">Password must be at least 8 characters</p>
          </div>
          <div class="col-12 col-sm-6 ca-field">
            <label class="ca-label" for="kit-select">Week</label>
            <select id="kit-select" class="ca-input">
              <option>Week 6 · Mini Cart</option>
              <option>Week 7 · Vue Router</option>
            </select>
          </div>
          <div class="col-12">
            <div class="form-check form-switch">
              <input id="kit-switch" class="form-check-input" type="checkbox" role="switch" checked />
              <label class="form-check-label" for="kit-switch">Allow catch-up</label>
            </div>
          </div>
        </div>
      </form>
    </section>

    <!-- ── Feedback ────────────────────────────────────────────────────── -->
    <section class="kit-section">
      <h2>Toasts &amp; confirm</h2>
      <p class="text-body-secondary small"><code>useToastStore().show(text, variant)</code> — never render your own toast.</p>
      <div class="d-flex flex-wrap gap-2">
        <button class="ca-btn ca-btn--secondary ca-btn--sm" data-testid="kit-toast-info" @click="toast.show('Checkpoint 3 is ready', 'info')">Info</button>
        <button class="ca-btn ca-btn--secondary ca-btn--sm" @click="toast.show('Checkpoint saved', 'success')">Success</button>
        <button class="ca-btn ca-btn--secondary ca-btn--sm" @click="toast.show('Reconnecting…', 'warning')">Warning</button>
        <button class="ca-btn ca-btn--secondary ca-btn--sm" @click="toast.show('Ana is already on this one', 'danger', { title: 'Already claimed' })">Danger</button>
        <button class="ca-btn ca-btn--danger ca-btn--sm" data-testid="kit-open-confirm" @click="confirmOpen = true">Open ConfirmModal</button>
      </div>
      <ConfirmModal
        v-model:open="confirmOpen"
        title="End this class?"
        confirm-label="End session"
        variant="danger"
        :busy="confirmBusy"
        @confirm="fakeConfirm"
      >
        Students will see "Class ended" and their work is saved.
      </ConfirmModal>
    </section>

    <section class="kit-section">
      <h2>Empty / not-found state</h2>
      <p class="text-body-secondary small">RLS returns zero rows for data you can't see — every view needs one of these.</p>
      <div class="ca-surface">
        <EmptyState icon="bi-journal-code" title="No lessons yet">
          Upload starter code or import from GitHub to create your first lesson.
          <template #actions>
            <button class="ca-btn ca-btn--primary">New lesson</button>
          </template>
        </EmptyState>
      </div>
    </section>

    <!-- ── IDE ─────────────────────────────────────────────────────────── -->
    <section id="ide" class="kit-section">
      <h2>IDE surfaces</h2>
      <p class="text-body-secondary small">
        Wrap the workspace / teach view in <code>&lt;div class="ca-ide" data-bs-theme="dark"&gt;</code>. Tokens, our
        <code>ca-</code> classes, Bootstrap utilities and StatusPill all switch to the dark palette.
      </p>
      <div class="ca-grid kit-swatches mb-3">
        <div v-for="s in ide" :key="s.token">
          <div class="kit-chip" :style="{ background: `var(${s.token})` }" />
          <div class="small fw-semibold">{{ s.name }}</div>
          <code class="small">{{ s.token }}</code>
        </div>
      </div>

      <div class="ca-ide kit-ide" data-bs-theme="dark">
        <div class="kit-ide__bar">
          <span class="kit-ide__tab is-active">App.vue</span>
          <span class="kit-ide__tab">ItemCard.vue</span>
          <span class="ms-auto d-flex align-items-center gap-2">
            <StatusPill state="error" size="sm" />
            <button class="ca-btn ca-btn--primary ca-btn--sm">Load checkpoint</button>
          </span>
        </div>
        <pre class="kit-ide__code"><span class="kit-ln">21</span>const emit = defineEmits(['add-to-cart'])
<span class="kit-ln">22</span>function addToCart() {
<span class="kit-ln kit-ln--err">23</span>  for (const item of items) {   <span class="kit-err">// ReferenceError: items is not defined</span>
<span class="kit-ln">24</span>    emit('add-to-cart', item)
<span class="kit-ln">25</span>  }
<span class="kit-ln">26</span>}</pre>
        <div class="kit-ide__terminal">
          <span class="text-body-secondary">$ pnpm dev</span><br />
          VITE ready in 412 ms · Local: http://localhost:5173/
        </div>
        <div class="d-flex flex-wrap align-items-center gap-2 p-3 border-top">
          <StatusPill v-for="s in TileStateOrder" :key="s" :state="s" />
          <input class="ca-input ms-md-auto kit-ide__input" placeholder="Dark input" aria-label="Dark input example" />
          <button class="ca-btn ca-btn--secondary ca-btn--sm">Secondary</button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.kit-lede {
  max-width: 48rem;
  margin-bottom: var(--ca-space-6);
}
.kit-section {
  margin-bottom: var(--ca-space-7);
}
.kit-swatches {
  --min: 8.5rem;
  --gap: var(--ca-space-3);
  margin-bottom: var(--ca-space-3);
}
.kit-chip {
  height: 3rem;
  margin-bottom: 0.375rem;
  border: 1px solid var(--ca-border);
  border-radius: var(--ca-radius);
}
.kit-ide {
  overflow: hidden;
  border: 1px solid var(--ca-ide-border);
  border-radius: var(--ca-radius-lg);
}
.kit-ide__bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ca-space-1) var(--ca-space-2);
  padding: var(--ca-space-2) var(--ca-space-3);
  background: var(--ca-ide-surface);
  border-bottom: 1px solid var(--ca-ide-border);
}
.kit-ide__tab {
  padding: var(--ca-space-1) var(--ca-space-3);
  border-radius: var(--ca-radius-sm);
  color: var(--ca-ide-muted);
  font-size: var(--ca-text-sm);
}
.kit-ide__tab.is-active {
  background: var(--ca-ide-raised);
  color: var(--ca-ide-text);
}
.kit-ide__code {
  margin: 0;
  padding: var(--ca-space-4);
  overflow-x: auto;
  color: var(--ca-ide-text);
  font-size: var(--ca-text-sm);
  line-height: 1.6;
}
.kit-ln {
  display: inline-block;
  width: 2.5rem;
  color: var(--ca-ide-muted);
  user-select: none;
}
.kit-ln--err {
  width: 2rem;
  margin-right: var(--ca-space-2);
  border-radius: 3px;
  background: var(--ca-state-error);
  color: var(--ca-on-brand);
  text-align: center;
}
.kit-err {
  color: var(--ca-state-error-fg);
}
.kit-ide__terminal {
  padding: var(--ca-space-3) var(--ca-space-4);
  background: var(--ca-ide-surface);
  border-top: 1px solid var(--ca-ide-border);
  font-family: var(--ca-font-mono);
  font-size: var(--ca-text-xs);
}
.kit-ide__input {
  width: auto;
  min-width: 10rem;
}
</style>
