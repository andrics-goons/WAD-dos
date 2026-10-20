<script setup>
import { ref } from 'vue'
import { TileStateOrder } from '@shared/constants.js'
import { useToastStore } from '@/stores/toast'
import StatusPill from '@/components/ui/StatusPill.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ConfirmModal from '@/components/ui/ConfirmModal.vue'
import JoinCodeInput from '@/components/ui/JoinCodeInput.vue'

// The /_kit page: shows every colour, button and component so the team can copy them.
const toast = useToastStore()
const confirmOpen = ref(false)
const confirmBusy = ref(false)
const email = ref('')
const password = ref('short')
const joinCode = ref('')

// colour samples, shown with Bootstrap classes the theme already maps to our tokens
const colours = [
  { name: 'Brand', token: '--ca-brand', cls: 'bg-primary text-white' },
  { name: 'Success', token: '--ca-success', cls: 'bg-success text-white' },
  { name: 'Danger', token: '--ca-danger', cls: 'bg-danger text-white' },
  { name: 'Warning', token: '--ca-warning', cls: 'bg-warning' },
  { name: 'Info', token: '--ca-info', cls: 'bg-info text-white' },
  { name: 'Brand subtle', token: '--ca-brand-subtle', cls: 'bg-primary-subtle' },
  { name: 'Page', token: '--ca-bg', cls: 'bg-body' },
  { name: 'Surface muted', token: '--ca-surface-muted', cls: 'bg-body-tertiary' },
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

    <div class="col-lg-8 text-body-secondary mb-5">
      <p class="mb-2">
        <strong class="text-body">Bootstrap</strong> for layout and responsiveness — grid,
        breakpoints, spacing: <code>row</code>, <code>col-md-6</code>, <code>d-flex gap-2</code>,
        <code>d-none d-md-block</code>.
      </p>
      <p class="mb-0">
        <strong class="text-body">Our <code>ca-</code> classes</strong> for the look — buttons,
        inputs, panels. Colours come from <code>src/styles/tokens.css</code>; never hard-code a hex
        colour.
      </p>
    </div>

    <!-- Colour -->
    <section class="mb-5">
      <h2>Colour</h2>
      <div class="row row-cols-2 row-cols-md-4 g-3">
        <div v-for="c in colours" :key="c.token" class="col">
          <div class="rounded border p-3 mb-1" :class="c.cls">{{ c.name }}</div>
          <code class="small">{{ c.token }}</code>
        </div>
      </div>
    </section>

    <!-- Tile states -->
    <section class="mb-5">
      <h2>Tile states</h2>
      <p class="text-body-secondary small">
        <code>&lt;StatusPill :state="tile.state" /&gt;</code> — always icon + label + colour.
        Tokens: <code>--ca-state-&lt;state&gt;</code>, <code>-bg</code>, <code>-fg</code>.
      </p>
      <div class="d-flex flex-wrap gap-2 mb-2">
        <StatusPill v-for="s in TileStateOrder" :key="s" :state="s" />
      </div>
      <div class="d-flex flex-wrap gap-2">
        <StatusPill v-for="s in TileStateOrder" :key="s" :state="s" size="sm" />
      </div>
    </section>

    <!-- Responsive layout -->
    <section class="mb-5">
      <h2>Responsive layout (Bootstrap breakpoints)</h2>
      <p class="text-body-secondary small">
        Layouts change at breakpoints, not at device names. Write the <strong>xs</strong> layout
        first, then add a class for the breakpoint where it should change — it applies from that
        width <em>upwards</em>.
      </p>

      <!-- only one of these badges shows at a time, so you can see the current breakpoint -->
      <div class="d-flex align-items-center gap-2 mb-3">
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
            <tr>
              <th>Breakpoint</th>
              <th>From</th>
              <th>Class infix</th>
              <th>Test at</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>xs</td>
              <td>0</td>
              <td><em>none</em> — <code>col-12</code>, <code>d-none</code></td>
              <td>375px and 575px</td>
            </tr>
            <tr>
              <td>sm</td>
              <td>576px</td>
              <td><code>-sm-</code> — <code>col-sm-6</code></td>
              <td>600px</td>
            </tr>
            <tr>
              <td>md</td>
              <td>768px</td>
              <td><code>-md-</code> — <code>d-md-flex</code></td>
              <td>800px</td>
            </tr>
            <tr>
              <td>lg</td>
              <td>992px</td>
              <td><code>-lg-</code> — <code>col-lg-4</code></td>
              <td>1024px</td>
            </tr>
            <tr>
              <td>xl</td>
              <td>1200px</td>
              <td><code>-xl-</code> — <code>col-xl-3</code></td>
              <td>1280px</td>
            </tr>
            <tr>
              <td>xxl</td>
              <td>1400px</td>
              <td><code>-xxl-</code> — <code>col-xxl-2</code></td>
              <td>1440px</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p class="text-body-secondary small">
        Page layout: <code>row g-3</code> + <code>col-12 col-sm-6 col-lg-4 col-xxl-3</code> → 1
        column at xs, 2 from sm, 3 from lg, 4 from xxl. Resize the window to see it.
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
        Lists of small cards: <code>row row-cols-2 row-cols-md-4 g-2</code> — 2 per row at xs, 4
        from md. Show/hide from a breakpoint up: <code>d-none d-md-block</code> (hidden below md),
        <code>d-md-none</code> (only below md).
      </p>
      <div class="row row-cols-2 row-cols-md-4 g-2">
        <div v-for="n in 8" :key="n" class="col">
          <div class="ca-surface p-3 small">Tile {{ n }}</div>
        </div>
      </div>
    </section>

    <!-- Type -->
    <section class="mb-5">
      <h2>Typography</h2>
      <div class="ca-card">
        <div class="ca-eyebrow mb-1">.ca-eyebrow</div>
        <h1>h1 — Week 6 · Mini Cart</h1>
        <h2>h2 — Step 4 of 8</h2>
        <h3 class="mb-3">h3 — Emit add-to-cart</h3>
        <p class="mb-1">
          Body text in Inter. Students read join codes like <strong>ABC234</strong> off a projector.
        </p>
        <p class="text-body-secondary mb-2">Muted text uses <code>.text-body-secondary</code>.</p>
        <span class="ca-mono">.ca-mono · const items = props.items</span>
      </div>
    </section>

    <!-- Buttons -->
    <section class="mb-5">
      <h2>Buttons</h2>
      <p class="text-body-secondary small">
        <code>ca-btn ca-btn--primary</code> for the main action on a screen,
        <code>--secondary</code> for alternatives, <code>--danger</code> only for destructive
        actions (behind a ConfirmModal).
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
        <button class="ca-btn ca-btn--secondary ca-btn--icon" aria-label="Settings">
          <i class="bi bi-gear" />
        </button>
        <button class="ca-btn ca-btn--primary" disabled>
          <span class="spinner-border spinner-border-sm" aria-hidden="true" />Saving…
        </button>
      </div>
    </section>

    <!-- Forms -->
    <section class="mb-5">
      <h2>Forms</h2>
      <p class="text-body-secondary small">
        <code>ca-field</code> + <code>ca-label</code> + <code>ca-input</code>; errors via
        <code>aria-invalid</code> and <code>ca-field-error</code>. Toggles use Bootstrap's
        <code>form-check form-switch</code>.
      </p>
      <form class="ca-card" novalidate @submit.prevent>
        <div class="row g-3">
          <div class="col-12 col-sm-6 ca-field">
            <label class="ca-label" for="kit-email">Email</label>
            <input
              id="kit-email"
              v-model="email"
              type="email"
              class="ca-input"
              placeholder="alex@codealong.test"
            />
            <p class="ca-field-hint">Use your school email</p>
          </div>
          <div class="col-12 col-sm-6 ca-field">
            <label class="ca-label" for="kit-pw">Password</label>
            <input
              id="kit-pw"
              v-model="password"
              type="password"
              class="ca-input"
              aria-invalid="true"
              aria-describedby="kit-pw-err"
            />
            <p id="kit-pw-err" class="ca-field-error">Password must be at least 8 characters</p>
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
              <input
                id="kit-switch"
                class="form-check-input"
                type="checkbox"
                role="switch"
                checked
              />
              <label class="form-check-label" for="kit-switch">Allow catch-up</label>
            </div>
          </div>
        </div>
      </form>
    </section>

    <!-- Join code -->
    <section class="mb-5">
      <h2>Join code input</h2>
      <p class="text-body-secondary small">
        <code>&lt;JoinCodeInput v-model="code" @complete="join" /&gt;</code> — one character per
        box, capitalised as you type; 0, O, 1, I, L and symbols can't be entered. Pasting a code
        fills every box.
      </p>
      <div class="ca-card">
        <JoinCodeInput
          v-model="joinCode"
          @complete="(code) => toast.show(`Complete: ${code}`, 'success')"
        />
        <p class="text-center small text-body-secondary mt-3 mb-0">
          Value: <code>{{ joinCode || '(empty)' }}</code>
        </p>
      </div>
    </section>

    <!-- Feedback -->
    <section class="mb-5">
      <h2>Toasts &amp; confirm</h2>
      <p class="text-body-secondary small">
        <code>useToastStore().show(text, variant)</code> — never render your own toast.
      </p>
      <div class="d-flex flex-wrap gap-2">
        <button
          class="ca-btn ca-btn--secondary ca-btn--sm"
          @click="toast.show('Checkpoint 3 is ready', 'info')"
        >
          Info
        </button>
        <button
          class="ca-btn ca-btn--secondary ca-btn--sm"
          @click="toast.show('Checkpoint saved', 'success')"
        >
          Success
        </button>
        <button
          class="ca-btn ca-btn--secondary ca-btn--sm"
          @click="toast.show('Reconnecting…', 'warning')"
        >
          Warning
        </button>
        <button
          class="ca-btn ca-btn--secondary ca-btn--sm"
          @click="toast.show('Ana is already on this one', 'danger', { title: 'Already claimed' })"
        >
          Danger
        </button>
        <button class="ca-btn ca-btn--danger ca-btn--sm" @click="confirmOpen = true">
          Open ConfirmModal
        </button>
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

    <section class="mb-5">
      <h2>Empty / not-found state</h2>
      <p class="text-body-secondary small">
        RLS returns zero rows for data you can't see — every view needs one of these.
      </p>
      <div class="ca-surface">
        <EmptyState icon="bi-journal-code" title="No lessons yet">
          Upload starter code or import from GitHub to create your first lesson.
          <template #actions>
            <button class="ca-btn ca-btn--primary">New lesson</button>
          </template>
        </EmptyState>
      </div>
    </section>

    <!-- IDE -->
    <section id="ide" class="mb-5">
      <h2>IDE surfaces</h2>
      <p class="text-body-secondary small">
        Wrap the workspace / teach view in
        <code>&lt;div class="ca-ide" data-bs-theme="dark"&gt;</code>. Our colours, <code>ca-</code>
        classes, Bootstrap utilities and StatusPill all switch to the dark palette — this sample is
        built from those alone.
      </p>
      <div class="ca-ide border rounded-3 overflow-hidden" data-bs-theme="dark">
        <div
          class="d-flex flex-wrap align-items-center gap-2 px-3 py-2 border-bottom bg-body-tertiary"
        >
          <span class="small px-2 py-1 rounded bg-body">App.vue</span>
          <span class="small px-2 py-1 text-body-secondary">ItemCard.vue</span>
          <StatusPill state="error" size="sm" class="ms-auto" />
          <button class="ca-btn ca-btn--primary ca-btn--sm">Load checkpoint</button>
        </div>
        <pre class="m-0 p-3 small">
const emit = defineEmits(['add-to-cart'])
function addToCart() {
  for (const item of items) {   <span class="text-danger">// ReferenceError: items is not defined</span>
    emit('add-to-cart', item)
  }
}</pre>
        <div class="px-3 py-2 border-top bg-body-tertiary small font-monospace">
          <span class="text-body-secondary">$ pnpm dev</span> · VITE ready in 412 ms
        </div>
        <div class="d-flex flex-wrap align-items-center gap-2 p-3 border-top">
          <StatusPill v-for="s in TileStateOrder" :key="s" :state="s" />
          <input
            class="ca-input w-auto ms-md-auto"
            placeholder="Dark input"
            aria-label="Dark input example"
          />
          <button class="ca-btn ca-btn--secondary ca-btn--sm">Secondary</button>
        </div>
      </div>
    </section>
  </div>
</template>
