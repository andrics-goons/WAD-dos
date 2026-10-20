<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { TileState } from '@shared/constants.js'
import { useAuthStore } from '@/stores/auth'
import StatusPill from '@/components/ui/StatusPill.vue'

// Public landing page (design-docs/04: hero + 3 feature cards; "Join a class" always visible).
// The hero preview is a static mock of the prof's dashboard — decoration, not live data.
const auth = useAuthStore()

// Phones: the sticky 'Join a class' bar appears only once the hero's own button has
// scrolled out of view, so the two never show at the same time.
const heroCta = ref(null)
const heroCtaVisible = ref(true)
let observer = null
onMounted(() => {
  observer = new IntersectionObserver(([entry]) => (heroCtaVisible.value = entry.isIntersecting))
  if (heroCta.value) observer.observe(heroCta.value.$el ?? heroCta.value)
})
onBeforeUnmount(() => observer?.disconnect())

// Mock class for the hero preview: 24 students, mostly fine, a cluster stuck on step 4
const PREVIEW = [
  ...Array(13).fill(TileState.DONE),
  ...Array(5).fill(TileState.IN_PROGRESS),
  ...Array(3).fill(TileState.ERROR),
  ...Array(2).fill(TileState.BEHIND),
  TileState.IDLE,
]
const previewTiles = PREVIEW.map((state, i) => ({ id: i, state }))
const previewCounts = [
  { state: TileState.DONE, count: 13 },
  { state: TileState.IN_PROGRESS, count: 5 },
  { state: TileState.ERROR, count: 3 },
  { state: TileState.BEHIND, count: 2 },
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
    body: 'One live tile per student shows who is done, working, stuck or behind — and groups the mistakes people share, so you can explain it once.',
  },
  {
    icon: 'bi-life-preserver',
    who: 'For TAs',
    title: 'Help the right person, fast',
    body: '"Check my work" and "Ask for help" land in one queue with the code side by side. Need to walk over? You get a Telegram ping with the seat.',
  },
]
</script>

<template>
  <div class="landing">
    <!-- ── Hero ───────────────────────────────────────────────────────── -->
    <section class="ca-page landing__hero">
      <div class="row g-4 g-lg-5 align-items-center">
        <div class="col-12 col-lg-6">
          <div class="ca-eyebrow mb-2">Live coding classes · IS216</div>
          <h1 class="landing__title">Code along live.<br />Nobody gets left behind.</h1>
          <p class="landing__lede">
            The prof's starter code becomes a step-by-step plan. Students follow in their browser,
            the prof sees who is keeping up, and anyone who falls behind can catch up in one click.
          </p>

          <div class="d-flex flex-wrap gap-2 mb-3">
            <RouterLink
              ref="heroCta"
              :to="{ name: 'join' }"
              class="ca-btn ca-btn--primary ca-btn--lg"
              data-testid="landing-join"
            >
              <i class="bi bi-box-arrow-in-right" />Join a class
            </RouterLink>
            <RouterLink
              v-if="auth.isAuthenticated"
              :to="{ name: 'courses' }"
              class="ca-btn ca-btn--secondary ca-btn--lg"
              data-testid="landing-courses"
            >
              My courses
            </RouterLink>
            <RouterLink
              v-else
              :to="{ name: 'register' }"
              class="ca-btn ca-btn--secondary ca-btn--lg"
              data-testid="landing-register"
            >
              Create an account
            </RouterLink>
          </div>
          <p v-if="!auth.isAuthenticated" class="small text-body-secondary mb-0">
            Teaching a class? Create an account and choose <strong>Educator</strong>.
          </p>
        </div>

        <!-- Static preview of the prof's class dashboard -->
        <div class="col-12 col-lg-6">
          <div class="ca-card landing__preview">
            <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
              <span class="landing__live"><span class="landing__live-dot" />Live</span>
              <span class="fw-semibold">Week 6 · Mini Cart</span>
              <span class="text-body-secondary small ms-auto">Step 4 of 8</span>
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

            <div class="landing__tiles mb-3">
              <span
                v-for="t in previewTiles"
                :key="t.id"
                class="landing__tile"
                :class="`landing__tile--${t.state}`"
              />
            </div>

            <div class="landing__group">
              <i class="bi bi-x-octagon-fill" />
              <span class="ca-mono small text-truncate">ReferenceError: items is not defined</span>
              <span class="landing__group-count">×3</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ── Features ───────────────────────────────────────────────────── -->
    <section class="ca-page pt-0">
      <h2 class="visually-hidden">What CodeAlong does</h2>
      <div class="row g-3">
        <div v-for="f in features" :key="f.title" class="col-12 col-md-4">
          <article class="ca-card h-100">
            <div class="landing__icon mb-3">
              <i class="bi" :class="f.icon" />
            </div>
            <div class="ca-eyebrow mb-1">{{ f.who }}</div>
            <h3 class="mb-2">{{ f.title }}</h3>
            <p class="text-body-secondary mb-0">{{ f.body }}</p>
          </article>
        </div>
      </div>

      <!-- Our unique angle (proposal objective 5) -->
      <div class="landing__privacy mt-4">
        <i class="bi bi-shield-lock" />
        <p class="mb-0">
          <strong>Privacy by design.</strong> Staff see your progress, never your code — unless you
          send it to them. "I'm lost" is anonymous: the prof only sees how many.
        </p>
      </div>
    </section>

    <!-- Phones (below md): keep "Join a class" in reach while scrolling,
         since the navbar's copy is folded behind the ☰ menu there -->
    <Transition name="landing-sticky">
      <div v-show="!heroCtaVisible" class="landing__sticky d-md-none">
        <RouterLink
          :to="{ name: 'join' }"
          class="ca-btn ca-btn--primary ca-btn--block"
          data-testid="landing-join-sticky"
        >
          <i class="bi bi-box-arrow-in-right" />Join a class
        </RouterLink>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* Leave room for the sticky bar below md so it never covers the last card */
.landing {
  padding-bottom: 5rem;
}
@media (min-width: 768px) {
  .landing {
    padding-bottom: 0;
  }
}

.landing__hero {
  padding-top: var(--ca-space-6);
}
@media (min-width: 992px) {
  .landing__hero {
    padding-top: var(--ca-space-7);
  }
}
.landing__title {
  margin-bottom: var(--ca-space-4);
  font-size: clamp(2rem, 6vw, 3rem);
  line-height: 1.1;
  letter-spacing: -0.03em;
}
.landing__lede {
  max-width: 34rem;
  margin-bottom: var(--ca-space-5);
  color: var(--ca-text-muted);
  font-size: var(--ca-text-lg);
}

/* ── Dashboard preview ── */
.landing__preview {
  box-shadow: var(--ca-shadow-lg);
}
.landing__live {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.15rem 0.55rem;
  border-radius: var(--ca-radius-pill);
  background: var(--ca-state-error-bg);
  color: var(--ca-state-error-fg);
  font-size: var(--ca-text-xs);
  font-weight: 600;
}
.landing__live-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: var(--ca-state-error);
  animation: landing-pulse 1.6s ease-in-out infinite;
}
@keyframes landing-pulse {
  50% {
    opacity: 0.35;
  }
}
@media (prefers-reduced-motion: reduce) {
  .landing__live-dot {
    animation: none;
  }
}
.landing__tiles {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: var(--ca-space-1);
}
@media (min-width: 576px) {
  .landing__tiles {
    grid-template-columns: repeat(12, 1fr);
  }
}
.landing__tile--done {
  --tile: var(--ca-state-done);
  --tile-bg: var(--ca-state-done-bg);
}
.landing__tile--in_progress {
  --tile: var(--ca-state-in_progress);
  --tile-bg: var(--ca-state-in_progress-bg);
}
.landing__tile--error {
  --tile: var(--ca-state-error);
  --tile-bg: var(--ca-state-error-bg);
}
.landing__tile--behind {
  --tile: var(--ca-state-behind);
  --tile-bg: var(--ca-state-behind-bg);
}
.landing__tile--idle {
  --tile: var(--ca-state-idle);
  --tile-bg: var(--ca-state-idle-bg);
}
.landing__tile {
  aspect-ratio: 1;
  border-radius: var(--ca-radius-sm);
  background: var(--tile-bg);
  border: 2px solid var(--tile);
}
.landing__group {
  display: flex;
  align-items: center;
  gap: var(--ca-space-2);
  padding: var(--ca-space-2) var(--ca-space-3);
  border-radius: var(--ca-radius);
  background: var(--ca-state-error-bg);
  color: var(--ca-state-error-fg);
  min-width: 0;
}
.landing__group .bi {
  color: var(--ca-state-error);
}
.landing__group-count {
  margin-left: auto;
  font-weight: 700;
}

/* ── Feature cards ── */
.landing__icon {
  display: inline-grid;
  place-items: center;
  width: 2.75rem;
  height: 2.75rem;
  border-radius: var(--ca-radius);
  background: var(--ca-brand-subtle);
  color: var(--ca-brand);
  font-size: 1.25rem;
}

/* ── Privacy strip ── */
.landing__privacy {
  display: flex;
  align-items: flex-start;
  gap: var(--ca-space-3);
  padding: var(--ca-space-4);
  border: 1px solid var(--ca-border);
  border-radius: var(--ca-radius-lg);
  background: var(--ca-brand-subtle);
}
.landing__privacy .bi {
  color: var(--ca-brand);
  font-size: 1.5rem;
  line-height: 1;
}

/* ── Sticky CTA (below md only) ── */
.landing__sticky {
  position: fixed;
  inset-inline: 0;
  bottom: 0;
  z-index: var(--ca-z-navbar);
  padding: var(--ca-space-3) var(--ca-space-4) calc(var(--ca-space-3) + env(safe-area-inset-bottom));
  background: var(--ca-surface);
  border-top: 1px solid var(--ca-border);
  box-shadow: var(--ca-shadow);
}
.landing-sticky-enter-active,
.landing-sticky-leave-active {
  transition: transform 0.2s ease;
}
.landing-sticky-enter-from,
.landing-sticky-leave-to {
  transform: translateY(100%);
}
</style>
