import { createRouter, createWebHistory } from 'vue-router'

import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'

/**
 * Route meta
 *   auth:  true   → must be signed in; otherwise → /login?returnTo=<path>
 *   roles: [...]  → account role (profiles.role) must be in this list; otherwise toast + /courses.
 *                   Admins pass every role check: they can read everything, and the RPCs
 *                   still refuse any write an admin isn't allowed to make.
 *   guest: true   → only for signed-out visitors; signed-in users go to /courses
 *   title:        → appended to the document title
 *
 * These guards are UX, not security. The browser talks to Postgres directly, so the
 * real boundary is Row Level Security: a student who hand-navigates to another
 * course's session gets zero rows back, not someone else's data. Course membership
 * is therefore never checked here — every view must render an empty / not-found
 * state for "the row exists but isn't yours".
 * See design-docs/04-pages-routes-and-events.md and 09-integration-contracts.md §4.
 *
 * Deployment: these are history-mode routes on a static host. vercel.json rewrites
 * every path to index.html, or a refresh on /s/:id/code — and the /join/:code link
 * printed in the QR code — would 404 before Vue ever loads.
 */
const STAFF = ['prof', 'ta']
const PROF = ['prof']
const ADMIN = ['admin']

const routes = [
  // ── Public ────────────────────────────────────────────────────────────────
  {
    path: '/',
    name: 'landing',
    component: () => import('@/views/LandingView.vue'),
    meta: { title: 'CodeAlong' },
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    meta: { title: 'Log in', guest: true },
  },
  {
    path: '/register',
    name: 'register',
    component: () => import('@/views/RegisterView.vue'),
    meta: { title: 'Create an account', guest: true },
  },

  // ── Any signed-in user ────────────────────────────────────────────────────
  {
    path: '/courses',
    name: 'courses',
    component: () => import('@/views/CoursesView.vue'),
    meta: { auth: true, title: 'My courses' },
  },
  {
    path: '/courses/:id',
    name: 'course',
    component: () => import('@/views/CourseView.vue'),
    props: true,
    meta: { auth: true, title: 'Course' },
  },
  {
    // One record for both /join and /join/:code. The QR code links to /join/<code>,
    // which pre-fills the code boxes and auto-submits.
    path: '/join/:code?',
    name: 'join',
    component: () => import('@/views/JoinView.vue'),
    props: true,
    meta: { auth: true, title: 'Join a class' },
  },
  {
    // The IDE: WebContainer runtime, file tree, editor, preview, terminal.
    // Membership and "is this session live" are decided by RLS + rpc('join_session'),
    // and the view itself refuses to boot when the page isn't cross-origin isolated.
    path: '/s/:id/code',
    name: 'workspace',
    component: () => import('@/views/WorkspaceView.vue'),
    props: true,
    meta: { auth: true, title: 'Workspace' },
  },
  {
    path: '/replays',
    name: 'replays',
    component: () => import('@/views/ReplayListView.vue'),
    meta: { auth: true, title: 'Replays' },
  },
  {
    path: '/replays/:sessionId',
    name: 'replay',
    component: () => import('@/views/ReplayView.vue'),
    props: true,
    meta: { auth: true, title: 'Replay' },
  },
  {
    path: '/profile',
    name: 'profile',
    component: () => import('@/views/ProfileView.vue'),
    meta: { auth: true, title: 'Profile' },
  },

  // ── Staff (prof / TA) ─────────────────────────────────────────────────────
  {
    path: '/s/:id/help',
    name: 'help-queue',
    component: () => import('@/views/HelpQueueView.vue'),
    props: true,
    meta: { auth: true, roles: STAFF, title: 'Help queue' },
  },
  {
    path: '/help/:requestId',
    name: 'help-review',
    component: () => import('@/views/HelpReviewView.vue'),
    props: true,
    meta: { auth: true, roles: STAFF, title: 'Help request' },
  },
  {
    path: '/sessions/:id/report',
    name: 'session-report',
    component: () => import('@/views/ReportView.vue'),
    props: true,
    meta: { auth: true, roles: STAFF, title: 'Session report' },
  },

  // ── Prof only ─────────────────────────────────────────────────────────────
  {
    path: '/s/:id/teach',
    name: 'teach',
    component: () => import('@/views/TeachView.vue'),
    props: true,
    meta: { auth: true, roles: PROF, title: 'Teach' },
  },
  {
    path: '/courses/:id/lessons/new',
    name: 'lesson-new',
    component: () => import('@/views/LessonNewView.vue'),
    props: true,
    meta: { auth: true, roles: PROF, title: 'New lesson' },
  },
  {
    path: '/lessons/:id/edit',
    name: 'lesson-edit',
    component: () => import('@/views/LessonEditView.vue'),
    props: true,
    meta: { auth: true, roles: PROF, title: 'Edit lesson' },
  },

  // ── Admin ─────────────────────────────────────────────────────────────────
  {
    // List users, change roles, disable accounts, send password resets.
    path: '/admin/users',
    name: 'admin-users',
    component: () => import('@/views/AdminUsersView.vue'),
    meta: { auth: true, roles: ADMIN, title: 'Users' },
  },

  // ── Catch-all ─────────────────────────────────────────────────────────────
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/views/NotFoundView.vue'),
    meta: { title: 'Page not found' },
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior(to, from, savedPosition) {
    return savedPosition ?? { top: 0 }
  },
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()

  // supabase-js restores the session from localStorage asynchronously, so the first
  // guarded navigation (e.g. a refresh on /s/:id/code) must wait for it.
  if (!auth.loaded) await auth.ensureLoaded()

  if (to.meta.guest && auth.isAuthenticated) {
    return { name: 'courses' }
  }

  if (to.meta.auth && !auth.isAuthenticated) {
    return { name: 'login', query: { returnTo: to.fullPath } }
  }

  if (to.meta.roles && auth.role !== 'admin' && !to.meta.roles.includes(auth.role)) {
    useToastStore().show("You don't have access to that page", 'warning')
    return { name: 'courses' }
  }

  return true
})

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} · CodeAlong` : 'CodeAlong'
})

export default router
