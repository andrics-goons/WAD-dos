<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

// "How it works" on the landing page: a mock CodeAlong screen that plays the four steps of a
// class on a loop, with a cursor that moves, clicks and types. It plays only while it's on
// screen; clicking a step jumps to it. Everything in it is made up.
const STEPS = [
  { title: 'The prof starts a class', body: 'One click gives a 6-character join code.' },
  { title: 'Students join with the code', body: 'Type it in, or scan the QR on the screen.' },
  { title: 'Everyone codes along', body: 'Students code in the browser as the prof does.' },
  {
    title: 'Nobody falls behind',
    body: "The prof sees who's done, who's stuck and who needs help, live.",
  },
]
const URLS = [
  'codealong.app/courses/is216',
  'codealong.app/join',
  'codealong.app/s/cart42/code',
  'codealong.app/s/cart42/teach',
]
const JOIN_CODE = 'CART42'
const CODE = `const cart = []

function addToCart(item) {
  cart.push(item)
  render()
}`
// step 4, the prof's teach view: the class, the order they finish in, and who gets stuck
const NAMES = ['Alex', 'Ben', 'Chloe', 'Dana', 'Eli', 'Fay', 'Gus', 'Hana']
const DONE_ORDER = [2, 5, 0, 7, 3, 6]
const STUCK = 1
const GROUPS = [
  { state: 'in_progress', label: 'In progress' },
  { state: 'done', label: 'Done' },
  { state: 'error', label: 'Error' },
]

const step = ref(0)
const cursor = ref('rest') // where the cursor is: a class name, see .demo__cursor--*
const clicking = ref(false)
const started = ref(false)
const code = ref('')
const joining = ref(false)
const typed = ref('')
const cartCount = ref(0)
const showStudents = ref(false)
const students = ref([])
const helpCount = ref(0)
const doneCount = computed(() => students.value.filter((st) => st.state === 'done').length)
const groups = computed(() =>
  GROUPS.map((g) => ({ ...g, names: students.value.filter((st) => st.state === g.state) })),
)

function reset() {
  cursor.value = 'rest'
  clicking.value = false
  started.value = false
  code.value = ''
  joining.value = false
  typed.value = ''
  cartCount.value = 0
  showStudents.value = false
  students.value = NAMES.map((name) => ({ name, state: 'in_progress' }))
  helpCount.value = 0
}

// Each play() gets a number; starting another (or stopping) makes the old one's waits throw,
// so only one ever runs.
let run = 0
const STOP = Symbol('stop')
const wait = (ms, id) =>
  new Promise((resolve, reject) => setTimeout(() => (id === run ? resolve() : reject(STOP)), ms))
async function click(target, id) {
  cursor.value = target
  await wait(800, id)
  clicking.value = true
  await wait(200, id)
  clicking.value = false
}

const SCENES = [
  async (id) => {
    await wait(600, id)
    await click('start', id)
    started.value = true
    cursor.value = 'rest'
    await wait(2800, id)
  },
  async (id) => {
    await wait(400, id)
    await click('box', id)
    for (const ch of JOIN_CODE) {
      await wait(180, id)
      code.value += ch
    }
    await click('join', id)
    joining.value = true
    await wait(1600, id)
  },
  async (id) => {
    await wait(500, id)
    for (const ch of CODE) {
      await wait(ch === '\n' ? 160 : 35, id)
      typed.value += ch
    }
    await click('add', id)
    cartCount.value = 1
    await wait(400, id)
    await click('add', id)
    cartCount.value = 2
    await wait(1600, id)
  },
  async (id) => {
    await wait(500, id)
    await click('students', id)
    showStudents.value = true
    cursor.value = 'rest'
    for (const i of DONE_ORDER) {
      await wait(450, id)
      students.value[i].state = 'done'
    }
    await wait(450, id)
    students.value[STUCK].state = 'error'
    helpCount.value = 1
    await wait(3200, id)
  },
]

async function play(from) {
  const id = ++run
  try {
    for (let s = from; ; s = (s + 1) % SCENES.length) {
      reset()
      step.value = s
      await SCENES[s](id)
    }
  } catch (error) {
    if (error !== STOP) throw error
  }
}
const stop = () => run++

// play while it's on screen, from wherever it was
const root = ref(null)
let observer = null
onMounted(() => {
  reset()
  observer = new IntersectionObserver(([entry]) =>
    entry.isIntersecting ? play(step.value) : stop(),
  )
  observer.observe(root.value)
})
onBeforeUnmount(() => {
  observer?.disconnect()
  stop()
})
</script>

<template>
  <div ref="root" class="row g-4 align-items-center">
    <!-- the steps: the playing one is highlighted, and clicking one jumps to it -->
    <ol class="col-12 col-lg-4 list-unstyled d-flex flex-column gap-2 mb-0">
      <li v-for="(s, i) in STEPS" :key="s.title">
        <button
          type="button"
          class="demo-step w-100 text-start d-flex gap-3"
          :class="{ 'demo-step--active': step === i }"
          @click="play(i)"
        >
          <span class="demo-step__number">{{ i + 1 }}</span>
          <span>
            <span class="d-block fw-semibold">{{ s.title }}</span>
            <span class="d-block small text-body-secondary">{{ s.body }}</span>
          </span>
        </button>
      </li>
    </ol>

    <div class="col-12 col-lg-8 order-first order-lg-last">
      <div class="demo">
        <div class="demo__bar">
          <span class="demo__dot" /><span class="demo__dot" /><span class="demo__dot" />
          <span class="demo__url">{{ URLS[step] }}</span>
        </div>

        <div class="demo__screen">
          <!-- 1. the prof starts a class -->
          <template v-if="step === 0">
            <div class="demo-at s0-heading fw-semibold">IS216 · Lessons</div>
            <div class="demo-at s0-lesson demo-panel">
              <i class="bi bi-folder2" />
              <span class="fw-semibold">Week 6 · Mini Cart</span>
              <span class="demo-badge">Ready</span>
            </div>
            <div class="demo-at s0-start demo-button" :class="{ 'demo-button--pressed': started }">
              Start class
            </div>
            <Transition name="ca-fade">
              <div v-if="started" class="demo-at s0-live demo-panel">
                <span class="demo-badge demo-badge--live"><i class="bi bi-broadcast" /> Live</span>
                <span class="text-body-secondary">Join code</span>
                <span class="s0-code ca-mono fw-bold">{{ JOIN_CODE }}</span>
              </div>
            </Transition>
          </template>

          <!-- 2. a student joins with the code -->
          <template v-else-if="step === 1">
            <div class="demo-at s1-title fw-bold">Join a class</div>
            <div class="demo-at s1-hint text-body-secondary">Enter the code on the projector</div>
            <div class="demo-at s1-boxes">
              <span
                v-for="i in JOIN_CODE.length"
                :key="i"
                class="s1-box ca-mono"
                :class="{ 's1-box--active': code.length === i - 1 && cursor !== 'rest' }"
                >{{ code[i - 1] }}</span
              >
            </div>
            <div class="demo-at s1-join demo-button" :class="{ 'demo-button--pressed': joining }">
              {{ joining ? 'Joining…' : 'Join' }}
            </div>
          </template>

          <!-- 3. everyone codes along: the editor, and the page it makes -->
          <template v-else-if="step === 2">
            <div class="demo-at s2-editor">
              <div class="s2-tab">app.js</div>
              <pre class="s2-code ca-mono">{{ typed }}<span class="s2-caret" /></pre>
            </div>
            <div class="demo-at s2-preview demo-panel" />
            <div class="demo-at s2-cart fw-semibold">
              Mini Cart <span class="demo-badge">Cart ({{ cartCount }})</span>
            </div>
            <div class="demo-at s2-item s2-item--1">Mug · $12</div>
            <div class="demo-at s2-item s2-item--2">Tee · $20</div>
            <div class="demo-at s2-add demo-button demo-button--small">Add</div>
            <div class="demo-at s2-add s2-add--2 demo-button demo-button--small">Add</div>
          </template>

          <!-- 4. the prof's teach view: students finish, one gets stuck and asks for help -->
          <div v-else class="s3">
            <div class="demo-at s3-head">
              <span class="fw-bold">Mini cart</span>
              <span><span class="s3-dot" /> {{ NAMES.length }} connected</span>
              <span class="text-body-secondary"><i class="bi bi-clock" /> 00:12:25</span>
              <span class="ms-auto s3-btn">Present</span>
              <span class="s3-btn">Announce</span>
              <span class="s3-btn s3-btn--end">End session</span>
            </div>

            <div class="demo-at s3-cards">
              <div class="s3-card">
                <span class="s3-eyebrow">Done</span>
                <span class="s3-number">{{ doneCount }}</span>
                <span class="text-body-secondary">of {{ NAMES.length }}</span>
                <progress class="s3-progress" :value="doneCount" :max="NAMES.length" />
              </div>
              <div class="s3-card">
                <span class="s3-eyebrow">Slow down</span>
                <span class="s3-number">0</span>
                <span class="text-body-secondary">Need more time</span>
              </div>
              <div class="s3-card">
                <span class="s3-eyebrow">Asked for help</span>
                <span class="s3-number">{{ helpCount }}</span>
                <span class="text-body-secondary">Waiting for help</span>
              </div>
              <div class="s3-card">
                <span class="s3-eyebrow">Check my work</span>
                <span class="s3-number">0</span>
                <span class="text-body-secondary">Waiting for a check</span>
              </div>
            </div>

            <div class="demo-at s3-toggle fw-semibold">
              <i class="bi bi-people" />
              {{ showStudents ? 'Hide' : 'Show' }} students · {{ NAMES.length }}
              <i class="bi" :class="showStudents ? 'bi-chevron-up' : 'bi-chevron-down'" />
            </div>
            <Transition name="ca-fade">
              <div v-if="showStudents" class="demo-at s3-panel">
                <span class="s3-eyebrow">Connected now · {{ NAMES.length }}</span>
                <div class="s3-groups">
                  <div v-for="g in groups" :key="g.state">
                    <span class="s3-pill" :class="`ca-state--${g.state}`">{{ g.label }}</span>
                    {{ g.names.length }}
                    <div v-for="st in g.names" :key="st.name" class="s3-name">
                      <span class="s3-avatar">{{ st.name[0] }}</span
                      >{{ st.name }}
                    </div>
                  </div>
                </div>
              </div>
            </Transition>

            <div class="demo-at s3-side s3-join">
              <span class="s3-eyebrow">Join code</span>
              <span class="d-flex align-items-center gap-2">
                <i class="bi bi-qr-code s3-qr" />
                <span class="ca-mono fw-bold s3-code">{{ JOIN_CODE }}</span>
              </span>
            </div>
            <div class="demo-at s3-side s3-checkpoints">
              <span class="fw-semibold">Checkpoints</span>
              <span class="s3-input">Title (optional)</span>
              <span class="s3-save"><i class="bi bi-flag-fill" /> Save checkpoint 1</span>
            </div>
            <div class="demo-at s3-side s3-stuck">
              <span class="fw-semibold">What the class is stuck on</span>
              <span class="text-body-secondary">
                {{ helpCount ? '1 help request waiting' : 'No common errors yet' }}
              </span>
            </div>
          </div>

          <span
            class="demo__cursor"
            :class="[`demo__cursor--${cursor}`, { 'demo__cursor--click': clicking }]"
          >
            <i class="bi bi-cursor-fill" />
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* The steps beside the screen */
.demo-step {
  padding: var(--ca-space-3) var(--ca-space-4);
  border: 1px solid var(--ca-border);
  border-radius: var(--ca-radius-lg);
  background: var(--ca-surface);
  color: var(--ca-text);
  transition:
    border-color 0.2s,
    box-shadow 0.2s;
}
.demo-step--active {
  border-color: var(--ca-brand);
  box-shadow: 0 0 0 3px var(--ca-brand-ring);
}
.demo-step__number {
  display: grid;
  flex: none;
  place-items: center;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: var(--ca-radius-pill);
  background: var(--ca-brand-subtle);
  color: var(--ca-brand);
  font-weight: 600;
}
.demo-step--active .demo-step__number {
  background: var(--ca-brand);
  color: var(--ca-on-brand);
}

/* The window. Everything inside is sized in cqw (1% of its width), so it scales as one picture
   and the cursor's positions (in % of the screen) always land on the buttons. */
.demo {
  container-type: inline-size;
  overflow: hidden;
  border: 1px solid var(--ca-border);
  border-radius: var(--ca-radius-lg);
  background: var(--ca-surface);
  box-shadow: var(--ca-shadow-lg);
}
.demo__bar {
  display: flex;
  align-items: center;
  gap: 1cqw;
  padding: 1.4cqw 2cqw;
  border-bottom: 1px solid var(--ca-border);
  background: var(--ca-surface-muted);
}
.demo__dot {
  width: 1.3cqw;
  height: 1.3cqw;
  border-radius: 50%;
  background: var(--ca-border-strong);
}
.demo__url {
  flex: 1;
  margin-left: 2cqw;
  padding: 0.5cqw 1.5cqw;
  border-radius: var(--ca-radius-pill);
  background: var(--ca-surface);
  color: var(--ca-text-muted);
  font-size: 1.6cqw;
}
.demo__screen {
  position: relative;
  aspect-ratio: 16 / 10;
  font-size: 1.9cqw;
  line-height: 1.3;
}
.demo-at {
  position: absolute;
}
.demo-panel {
  display: flex;
  align-items: center;
  gap: 1.5cqw;
  padding: 0 2cqw;
  border: 1px solid var(--ca-border);
  border-radius: 1cqw;
  background: var(--ca-surface);
}
.demo-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.6cqw;
  border-radius: 0.8cqw;
  background: var(--ca-brand);
  color: var(--ca-on-brand);
  font-weight: 600;
  transition: transform 0.15s;
}
.demo-button--pressed {
  background: var(--ca-brand-active);
}
.demo-button--small {
  font-size: 1.5cqw;
}
.demo-button--quiet {
  border: 1px solid var(--ca-border-strong);
  background: var(--ca-surface);
  color: var(--ca-text);
}
.demo-badge {
  padding: 0.3cqw 1cqw;
  border-radius: var(--ca-radius-pill);
  background: var(--ca-surface-muted);
  font-size: 1.4cqw;
  font-weight: 600;
}
.demo-badge--live {
  background: var(--ca-state-error-bg);
  color: var(--ca-state-error-fg);
}

/* 1. start a class */
.s0-heading {
  top: 9%;
  left: 6%;
  font-size: 2.4cqw;
}
.s0-lesson {
  top: 24%;
  left: 6%;
  width: 88%;
  height: 20%;
}
.s0-start {
  top: 28.5%;
  left: 70%;
  width: 20%;
  height: 11%;
}
.s0-live {
  top: 52%;
  left: 6%;
  width: 88%;
  height: 38%;
  justify-content: center;
}
.s0-code {
  font-size: 6cqw;
  letter-spacing: 1cqw;
  color: var(--ca-brand);
}

/* 2. join with the code */
.s1-title {
  top: 12%;
  width: 100%;
  font-size: 3cqw;
  text-align: center;
}
.s1-hint {
  top: 23%;
  width: 100%;
  text-align: center;
}
.s1-boxes {
  top: 34%;
  left: 21%;
  display: flex;
  gap: 2%;
  width: 58%;
  height: 16%;
}
.s1-box {
  display: grid;
  flex: 1;
  place-items: center;
  border: 1px solid var(--ca-border-strong);
  border-radius: 0.8cqw;
  font-size: 3.4cqw;
}
.s1-box--active {
  border-color: var(--ca-brand);
  box-shadow: 0 0 0 0.4cqw var(--ca-brand-ring);
}
.s1-join {
  top: 60%;
  left: 35%;
  width: 30%;
  height: 11%;
}

/* 3. code along */
.s2-editor {
  top: 6%;
  left: 3%;
  width: 57%;
  height: 88%;
  overflow: hidden;
  border-radius: 1cqw;
  background: var(--ca-ide-bg);
  color: var(--ca-ide-text);
}
.s2-tab {
  padding: 1cqw 2cqw;
  border-bottom: 1px solid var(--ca-ide-border);
  background: var(--ca-ide-surface);
  color: var(--ca-ide-muted);
  font-size: 1.5cqw;
}
.s2-code {
  margin: 0;
  padding: 2cqw;
  color: inherit;
  font-size: 1.7cqw;
  line-height: 1.6;
  white-space: pre;
}
.s2-caret {
  display: inline-block;
  width: 0.25cqw;
  height: 1em;
  margin-left: 0.2cqw;
  vertical-align: text-bottom;
  background: var(--ca-ide-accent);
  animation: blink 1s steps(1) infinite;
}
.s2-preview {
  top: 6%;
  left: 62%;
  width: 35%;
  height: 88%;
}
.s2-cart {
  top: 14%;
  left: 65%;
  display: flex;
  align-items: center;
  gap: 1.2cqw;
}
.s2-item {
  left: 65%;
}
.s2-item--1 {
  top: 37%;
}
.s2-item--2 {
  top: 50%;
}
.s2-add {
  top: 36%;
  left: 85%;
  width: 9%;
  height: 8%;
}
.s2-add--2 {
  top: 49%;
}

/* 4. the prof's teach view, smaller text since it holds more */
.s3 {
  font-size: 1.25cqw;
}
.s3-head {
  top: 0;
  left: 0;
  display: flex;
  align-items: center;
  gap: 1.5cqw;
  width: 100%;
  height: 9%;
  padding: 0 2cqw;
  border-bottom: 1px solid var(--ca-border);
}
.s3-dot {
  display: inline-block;
  width: 0.8cqw;
  height: 0.8cqw;
  border-radius: 50%;
  background: var(--ca-state-done);
}
.s3-btn {
  padding: 0.4cqw 1cqw;
  border: 1px solid var(--ca-border-strong);
  border-radius: 0.6cqw;
  font-weight: 600;
}
.s3-btn--end {
  border-color: var(--ca-danger);
  background: var(--ca-danger);
  color: var(--ca-on-brand);
}
.s3-cards {
  top: 12%;
  left: 2%;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1cqw;
  width: 68%;
  height: 19%;
}
.s3-card,
.s3-side,
.s3-panel {
  display: flex;
  flex-direction: column;
  gap: 0.4cqw;
  padding: 1cqw 1.2cqw;
  border: 1px solid var(--ca-border);
  border-radius: 0.8cqw;
  background: var(--ca-surface);
}
.s3-eyebrow {
  color: var(--ca-text-muted);
  font-size: 0.95cqw;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.s3-number {
  font-size: 2.4cqw;
  font-weight: 700;
  line-height: 1;
}
.s3-progress {
  width: 100%;
  height: 0.5cqw;
  border: 0;
  border-radius: var(--ca-radius-pill);
  background: var(--ca-border);
  appearance: none;
}
.s3-progress::-webkit-progress-bar {
  border-radius: var(--ca-radius-pill);
  background: var(--ca-border);
}
.s3-progress::-webkit-progress-value {
  border-radius: var(--ca-radius-pill);
  background: var(--ca-brand);
  transition: width 0.3s;
}
.s3-progress::-moz-progress-bar {
  border-radius: var(--ca-radius-pill);
  background: var(--ca-brand);
}
.s3-toggle {
  top: 34%;
  left: 2%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.6cqw;
  width: 68%;
  height: 6%;
  border-radius: 0.8cqw;
  background: var(--ca-surface-muted);
}
.s3-panel {
  top: 43%;
  left: 2%;
  width: 68%;
  height: 53%;
  box-shadow: var(--ca-shadow-lg);
}
.s3-groups {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1.5cqw;
  margin-top: 0.8cqw;
}
.s3-pill {
  padding: 0.2cqw 0.8cqw;
  border-radius: var(--ca-radius-pill);
  background: var(--state-bg);
  color: var(--state-fg);
  font-size: 1cqw;
  font-weight: 600;
}
.s3-name {
  display: flex;
  align-items: center;
  gap: 0.8cqw;
  margin-top: 0.8cqw;
}
.s3-avatar {
  display: grid;
  place-items: center;
  width: 2.2cqw;
  height: 2.2cqw;
  border-radius: 50%;
  background: var(--ca-brand-subtle);
  color: var(--ca-brand);
  font-size: 1cqw;
}
.s3-side {
  left: 72%;
  width: 26%;
}
.s3-join {
  top: 12%;
  height: 28%;
}
.s3-qr {
  font-size: 5cqw;
  line-height: 1;
}
.s3-code {
  font-size: 2.4cqw;
  letter-spacing: 0.3cqw;
}
.s3-checkpoints {
  top: 43%;
  height: 30%;
}
.s3-input {
  padding: 0.5cqw 0.8cqw;
  border: 1px solid var(--ca-border-strong);
  border-radius: 0.6cqw;
  color: var(--ca-text-muted);
}
.s3-save {
  padding: 0.6cqw;
  border-radius: 0.6cqw;
  background: var(--ca-brand);
  color: var(--ca-on-brand);
  font-weight: 600;
  text-align: center;
}
.s3-stuck {
  top: 76%;
  height: 20%;
}

/* The cursor: its tip sits on the point it's moved to */
.demo__cursor {
  position: absolute;
  z-index: 1;
  font-size: 3cqw;
  color: var(--ca-text);
  filter: drop-shadow(0 0.2cqw 0.3cqw rgba(15, 23, 42, 0.35));
  line-height: 1;
  transform: scaleX(-1); /* the icon points up-right; flip it to point up-left like a mouse */
  transition:
    top 0.8s ease-in-out,
    left 0.8s ease-in-out;
}
.demo__cursor--click {
  font-size: 2.6cqw;
}
.demo__cursor--rest {
  top: 82%;
  left: 60%;
}
.demo__cursor--start {
  top: 34%;
  left: 80%;
}
.demo__cursor--box {
  top: 42%;
  left: 25%;
}
.demo__cursor--join {
  top: 65.5%;
  left: 50%;
}
.demo__cursor--add {
  top: 40%;
  left: 89.5%;
}
.demo__cursor--students {
  top: 37%;
  left: 38%;
}

@keyframes blink {
  50% {
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .demo__cursor {
    transition: none;
  }
  .s2-caret {
    animation: none;
  }
}
</style>
