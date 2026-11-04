<script setup>
import { SignupRole } from '@shared/constants.js'
import LandingCodeBackdrop from '@/components/landing/LandingCodeBackdrop.vue'
import HowItWorksDemo from '@/components/landing/HowItWorksDemo.vue'

// The public home page: the motto over a class's code scrolling past, a card per role (each
// opens sign-up with that role picked), and a screen that plays how a class works.
// Logged-in users go to /home instead.
const roles = [
  {
    icon: 'bi-laptop',
    who: 'Students',
    title: 'Keep up, and know why it broke',
    body: 'Code alongside the prof, catch up in one click, and make sense of your errors.',
    role: SignupRole.STUDENT,
    cta: 'Sign up as a student',
  },
  {
    icon: 'bi-grid-3x3-gap',
    who: 'Profs',
    title: 'See the whole room',
    body: "Every student's progress live, and the errors they share, so you know who's stuck and why.",
    role: SignupRole.EDUCATOR,
    cta: 'Sign up as an educator',
  },
  {
    icon: 'bi-life-preserver',
    who: 'TAs',
    title: 'Help faster, answer less',
    body: 'Requests arrive in one queue with the code attached, so you go straight to who needs you.',
    role: SignupRole.STUDENT, // a TA signs up as a student; the prof then adds them as a TA
    cta: 'Sign up, then get added as a TA',
  },
]
</script>

<template>
  <div>
    <!-- Hero: the motto in the middle, over the code -->
    <section class="landing-hero">
      <div class="landing-hero__code ca-ide" data-bs-theme="dark">
        <LandingCodeBackdrop />
        <div class="landing-hero__content ca-page text-center">
          <div class="ca-eyebrow mb-3">Live coding classes · IS216</div>
          <h1 class="display-3 fw-bold mb-3">Code along live.<br />Nobody gets left behind.</h1>
          <p class="fs-5 text-body-secondary mx-auto mb-4 landing-hero__lead">
            Follow the prof's code as it happens. Fall behind? Catch up in one click.
          </p>
          <div class="d-flex flex-wrap justify-content-center gap-2">
            <RouterLink :to="{ name: 'join' }" class="ca-btn ca-btn--primary ca-btn--lg">
              <i class="bi bi-box-arrow-in-right" />Join a class
            </RouterLink>
            <RouterLink :to="{ name: 'register' }" class="ca-btn ca-btn--secondary ca-btn--lg">
              Create an account
            </RouterLink>
          </div>
        </div>
      </div>
    </section>

    <!-- Roles: each card opens sign-up with its role picked -->
    <section class="ca-page">
      <h2 class="display-6 fw-bold text-center mb-4">Made for everyone in the room</h2>
      <div class="row g-3">
        <div v-for="r in roles" :key="r.who" class="col-12 col-md-4">
          <RouterLink
            :to="{ name: 'register', query: { role: r.role } }"
            class="ca-card role-card d-flex flex-column h-100 text-reset text-decoration-none"
          >
            <i class="bi fs-3 text-primary" :class="r.icon" />
            <div class="ca-eyebrow mt-2 mb-1">{{ r.who }}</div>
            <h3 class="mb-2">{{ r.title }}</h3>
            <p class="text-body-secondary mb-3">{{ r.body }}</p>
            <span class="role-card__cta mt-auto fw-semibold small">
              {{ r.cta }} <i class="bi bi-arrow-right" />
            </span>
          </RouterLink>
        </div>
      </div>
    </section>

    <!-- How it works: a screen playing the steps -->
    <section class="ca-page pt-0">
      <h2 class="display-6 fw-bold text-center mb-4">How a class works</h2>
      <HowItWorksDemo />
    </section>

    <footer class="border-top py-4 text-center small text-body-secondary">© CodeAlong</footer>
  </div>
</template>

<style scoped>
/* the hero fills the screen under the navbar, and its bottom edge fades into the page */
.landing-hero {
  position: relative;
}
.landing-hero::after {
  content: '';
  position: absolute;
  inset: auto 0 0;
  height: 8rem;
  background: linear-gradient(transparent, var(--ca-bg));
  pointer-events: none;
}
.landing-hero__code {
  position: relative;
  display: flex;
  align-items: center;
  min-height: calc(100dvh - var(--ca-navbar-height));
  overflow: hidden;
}
/* a dark glow behind the headline, so the code never gets in the way of reading it */
.landing-hero__code::after {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(
    ellipse 90% 45% at center,
    color-mix(in srgb, var(--ca-ide-bg) 92%, transparent),
    transparent
  );
}
@media (min-width: 768px) {
  .landing-hero__code::after {
    background: radial-gradient(
      ellipse 45% 40% at center,
      color-mix(in srgb, var(--ca-ide-bg) 92%, transparent),
      transparent
    );
  }
}
.landing-hero__content {
  position: relative;
  z-index: 1;
}
.landing-hero__lead {
  max-width: 36rem;
}

/* a role card lifts on hover, and its link turns brand-coloured */
.role-card {
  transition:
    transform 0.2s,
    box-shadow 0.2s,
    border-color 0.2s;
}
.role-card:hover {
  transform: translateY(-4px);
  border-color: var(--ca-brand);
  box-shadow: var(--ca-shadow-lg);
}
.role-card__cta {
  color: var(--ca-text-muted);
}
.role-card:hover .role-card__cta {
  color: var(--ca-brand);
}
</style>
