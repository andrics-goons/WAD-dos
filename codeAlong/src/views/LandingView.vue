<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { TileState } from '@shared/constants.js'
import { useAuthStore } from '@/stores/auth'
import StatusPill from '@/components/ui/StatusPill.vue'

// The public home page: a headline, a fake preview of the prof's dashboard, three feature cards,
// how it works in 4 steps, and a footer. Logged-in users go to /home instead.
const auth = useAuthStore()

// On phones, the bottom "Join a class" bar only appears once the main button scrolls away.
const heroCta = ref(null)
const heroCtaVisible = ref(true)
let observer = null
onMounted(() => {
  observer = new IntersectionObserver(([entry]) => (heroCtaVisible.value = entry.isIntersecting))
  if (heroCta.value) observer.observe(heroCta.value.$el ?? heroCta.value)
})
onBeforeUnmount(() => observer?.disconnect())

// made-up class of 24 students for the preview — mostly fine, a few stuck
const PREVIEW = [
  ...Array(13).fill(TileState.DONE),
  ...Array(7).fill(TileState.IN_PROGRESS),
  ...Array(3).fill(TileState.ERROR),
  TileState.IDLE,
]
const previewTiles = PREVIEW.map((state, i) => ({ id: i, state }))
const previewCounts = [
  { state: TileState.DONE, count: 13 },
  { state: TileState.IN_PROGRESS, count: 7 },
  { state: TileState.ERROR, count: 3 },
]

const features = [
  {
    icon: 'bi-laptop',
    who: 'For students',
    title: 'Code along — and catch up',
    body: 'Code in your browser next to the prof. Fell behind? Load the latest checkpoint, keep your own attempt, and see exactly what you missed.',
  },
  {
    icon: 'bi-grid-3x3-gap',
    who: 'For profs',
    title: 'See the whole room',
    body: 'One live tile per student shows who is done, still working or stuck — and groups the mistakes people share, so you can explain it once.',
  },
  {
    icon: 'bi-life-preserver',
    who: 'For TAs',
    title: 'Help the right person, fast',
    body: '"Check my work" and "Ask for help" land in one queue with the code side by side. Need to walk over? You get a Telegram ping with the seat.',
  },
]

const steps = [
  { title: 'The prof starts a class', body: 'Pick a lesson and get a 6-character join code.' },
  { title: 'Students join with the code', body: 'Type it in, or scan the QR on the screen.' },
  { title: 'Everyone codes along', body: 'Students code in their browser as the prof codes.' },
  {
    title: 'Students keep up',
    body: 'Mark Done, load the latest checkpoint, or ask for help.',
  },
]
</script>

<template>
  <!-- extra space at the bottom on phones, so the sticky bar never covers the last card -->
  <div class="pb-5 pb-md-0">
    <!-- Hero -->
    <section class="ca-page pt-lg-5">
      <div class="row g-4 g-lg-5 align-items-center">
        <div class="col-12 col-lg-6">
          <div class="ca-eyebrow mb-2">Live coding classes · IS216</div>
          <h1 class="display-5 fw-semibold mb-3">Code along live.<br />Nobody gets left behind.</h1>
          <p class="fs-5 text-body-secondary mb-4">
            Follow the prof's code live. Fall behind? Load the latest checkpoint in one click.
          </p>

          <div class="d-flex flex-wrap gap-2 mb-3">
            <RouterLink
              ref="heroCta"
              :to="{ name: 'join' }"
              class="ca-btn ca-btn--primary ca-btn--lg"
            >
              <i class="bi bi-box-arrow-in-right" />Join a class
            </RouterLink>
            <RouterLink
              v-if="auth.isAuthenticated"
              :to="{ name: 'courses' }"
              class="ca-btn ca-btn--secondary ca-btn--lg"
            >
              My courses
            </RouterLink>
            <RouterLink
              v-else
              :to="{ name: 'register' }"
              class="ca-btn ca-btn--secondary ca-btn--lg"
            >
              Create an account
            </RouterLink>
          </div>
          <p v-if="!auth.isAuthenticated" class="small text-body-secondary mb-0">
            Teaching a class? Create an account and choose <strong>Educator</strong>.
          </p>
        </div>

        <!-- fake dashboard preview (not real data) -->
        <div class="col-12 col-lg-6">
          <div class="ca-card shadow-lg">
            <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
              <span class="ca-pill ca-pill--sm ca-state--error">
                <i class="bi bi-broadcast" />Live
              </span>
              <span class="fw-semibold">Week 6 · Mini Cart</span>
              <span class="text-body-secondary small ms-auto">Checkpoint 4</span>
            </div>

            <div class="d-flex flex-wrap gap-2 mb-3">
              <StatusPill
                v-for="c in previewCounts"
                :key="c.state"
                :state="c.state"
                size="sm"
                :label="`${c.count}`"
              />
            </div>

            <div class="preview-tiles mb-3">
              <span v-for="t in previewTiles" :key="t.id" :class="`ca-state--${t.state}`" />
            </div>

            <div class="ca-pill ca-state--error w-100 py-2">
              <i class="bi bi-x-octagon-fill" />
              <span class="ca-mono text-truncate">ReferenceError: items is not defined</span>
              <span class="ms-auto">×3</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Features -->
    <section class="ca-page pt-0">
      <h2 class="visually-hidden">What CodeAlong does</h2>
      <div class="row g-3">
        <div v-for="f in features" :key="f.title" class="col-12 col-md-4">
          <article class="ca-card h-100">
            <i class="bi fs-3 text-primary" :class="f.icon" />
            <div class="ca-eyebrow mt-2 mb-1">{{ f.who }}</div>
            <h3 class="mb-2">{{ f.title }}</h3>
            <p class="text-body-secondary mb-0">{{ f.body }}</p>
          </article>
        </div>
      </div>

      <!-- our privacy promise -->
      <div class="alert alert-primary d-flex gap-3 mt-4 mb-0">
        <i class="bi bi-shield-lock fs-4" />
        <p class="mb-0">
          <strong>Privacy by design.</strong> Staff see your progress, never your code — unless you
          send it to them. "Slow down" is anonymous: the prof only sees how many.
        </p>
      </div>
    </section>

    <!-- How it works: 4 steps, one row on desktop, 2×2 on tablets, stacked on phones -->
    <section class="ca-page pt-0">
      <h2 class="mb-3">How it works</h2>
      <div class="row g-3">
        <div v-for="(s, i) in steps" :key="s.title" class="col-12 col-sm-6 col-lg-3">
          <div class="ca-card h-100">
            <span class="badge text-bg-primary rounded-pill mb-2">Step {{ i + 1 }}</span>
            <h3 class="mb-1">{{ s.title }}</h3>
            <p class="text-body-secondary mb-0">{{ s.body }}</p>
          </div>
        </div>
      </div>
    </section>

    <footer class="border-top py-4 text-center small text-body-secondary">© CodeAlong</footer>

    <!-- phones only: a "Join a class" bar that appears once the main button scrolls away -->
    <Transition name="ca-fade">
      <div
        v-show="!heroCtaVisible"
        class="position-fixed bottom-0 start-0 end-0 z-3 d-md-none p-3 bg-body border-top shadow"
      >
        <RouterLink :to="{ name: 'join' }" class="ca-btn ca-btn--primary ca-btn--block">
          <i class="bi bi-box-arrow-in-right" />Join a class
        </RouterLink>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* the mini class in the preview: one coloured square per student */
.preview-tiles {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: var(--ca-space-1);
}
.preview-tiles span {
  aspect-ratio: 1;
  border: 2px solid var(--state);
  border-radius: var(--ca-radius-sm);
  background: var(--state-bg);
}
</style>
