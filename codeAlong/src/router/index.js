import { createRouter, createWebHistory } from 'vue-router'

import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'

/**
 * route meta
 *   auth:  true   → must be signed in; otherwise → /login?returnTo=<path>
 *   roles: [...]  → account role (profiles.role) must be in this list; otherwise toast + /courses.
 *                   Admins pass every role check: they can read everything, and the RPCs
 *                   still refuse any write an admin isn't allowed to make.
 *   guest: true   → only for signed-out visitors; signed-in users go to /home
 *   title:        → appended to the document title
 *   back:         → (route) => { label, to? } for the back button (components/ui/BackButton.vue).
 *                   Without `to` it returns to the previous page. main pages have none.
 *
 * these guards are UX, not security. the browser talks to Postgres directly, so the
 * real boundary is Row Level Security: a student who hand-navigates to another
 * course's session gets zero rows back, not someone else's data. course membership
 * is therefore never checked here. every view must render an empty / not-found
 * state for "the row exists but isn't yours".
 *
 * deployment: these are history-mode routes on a static host. vercel.json rewrites
 * every path to index.html, or a refresh on /s/:id/code (and the /join/:code link
 * printed in the QR code) would 404 before Vue ever loads.
 */
const STAFF = ['prof', 'ta']
const PROF = ['prof']
const ADMIN = ['admin']

const toMyCourses = () => ({ label: 'My courses', to: { name: 'courses' } })
const toCourse = () => ({ label: 'Back to course' })

const routes = [
  // ── Public ────────────────────────────────────────────────────────────────
  {
    path: '/',
    name: 'landing',
    component: () => import('@/views/LandingView.vue'),
    meta: { guest: true }, // no title → the tab shows plain "CodeAlong" (see afterEach)
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
    // where you land once logged in: live classes + your courses
    path: '/home',
    name: 'home',
    component: () => import('@/views/HomeView.vue'),
    meta: { auth: true, title: 'Home' },
  },
  {
    path: '/courses',
    name: 'courses',
    component: () => import('@/views/CoursesView.vue'),
    // the new course form (?new=1) is a step inside this page
    meta: {
      auth: true,
      title: 'My courses',
      back: (route) => (route.query.new ? toMyCourses() : null),
    },
  },
  {
    path: '/courses/:id',
    name: 'course',
    component: () => import('@/views/CourseView.vue'),
    props: true,
    meta: { auth: true, title: 'Course', back: toMyCourses },
  },
  {
    // One record for both /join and /join/:code. the QR code links to /join/<code>,
    // which pre-fills the code boxes and auto-submits.
    path: '/join/:code?',
    name: 'join',
    component: () => import('@/views/JoinView.vue'),
    props: true,
    meta: { auth: true, title: 'Join a class' },
  },
  {
    // Join a COURSE (once per term). /enrol shows a code box; /enrol/<code> is the
    // shareable link / QR the prof hands out. it pre-fills the box and auto-submits.
    // Not the same as /join, which joins one live class inside a course.
    path: '/enrol/:code?',
    name: 'enrol',
    component: () => import('@/views/EnrolView.vue'),
    props: true,
    meta: { auth: true, roles: ['student', 'ta'], title: 'Enrol in a course', back: toMyCourses },
  },
  {
    // The IDE: WebContainer runtime, file tree, editor, preview, terminal.
    // Membership and "is this session live" are decided by RLS + rpc('join_session'),
    // and the view itself refuses to boot when the page isn't cross-origin isolated.
    path: '/s/:id/code',
    name: 'workspace',
    component: () => import('@/views/WorkspaceView.vue'),
    props: true,
    meta: { auth: true, title: 'Workspace' }, // no back bar: the student's screen is all workspace
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
    meta: {
      auth: true,
      title: 'Replay',
      back: () => ({ label: 'All replays', to: { name: 'replays' } }),
    },
  },
  {
    // right after "Continue with GitHub" makes a new account: student or educator?
    path: '/welcome',
    name: 'choose-role',
    component: () => import('@/views/ChooseRoleView.vue'),
    meta: { auth: true, title: 'Welcome' },
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
    meta: { auth: true, roles: STAFF, title: 'Help queue' }, // no back bar in a live class
  },
  {
    path: '/help/:requestId',
    name: 'help-review',
    component: () => import('@/views/HelpReviewView.vue'),
    props: true,
    // no meta.back: the page has its own "Help queue" button, and it is often opened straight from
    // a Telegram link, with no page behind it
    meta: { auth: true, roles: STAFF, title: 'Help request' },
  },
  {
    // a TA's own runnable copy of the student's code. it always opens in a new tab from the review
    // panel, so there is nothing behind it to go back to (and no meta.back): the tab is closed
    path: '/help/:requestId/code',
    name: 'help-code',
    component: () => import('@/views/HelpCodeView.vue'),
    props: true,
    meta: { auth: true, roles: STAFF, title: "Student's code" },
  },
  {
    path: '/sessions/:id/report',
    name: 'session-report',
    component: () => import('@/views/ReportView.vue'),
    props: true,
    meta: { auth: true, roles: STAFF, title: 'Session report', back: toCourse },
  },

  // ── Prof only ─────────────────────────────────────────────────────────────
  {
    path: '/s/:id/teach',
    name: 'teach',
    component: () => import('@/views/TeachView.vue'),
    props: true,
    meta: { auth: true, roles: PROF, title: 'Teach' }, // no back bar: the prof's screen is all class
  },
  {
    path: '/courses/:id/lessons/new',
    name: 'lesson-new',
    component: () => import('@/views/LessonNewView.vue'),
    props: true,
    meta: {
      auth: true,
      roles: PROF,
      title: 'New lesson',
      back: (route) => ({
        label: 'Back to course',
        to: { name: 'course', params: { id: route.params.id } },
      }),
    },
  },
  {
    path: '/lessons/:id/edit',
    name: 'lesson-edit',
    component: () => import('@/views/LessonEditView.vue'),
    props: true,
    meta: { auth: true, roles: PROF, title: 'Edit lesson', back: toCourse },
  },

  // ── Admin ─────────────────────────────────────────────────────────────────
  {
    // List users and change their roles.
    path: '/admin/users',
    name: 'admin-users',
    component: () => import('@/views/AdminUsersView.vue'),
    meta: { auth: true, roles: ADMIN, title: 'Users' },
  },

  // ── Dev reference ─────────────────────────────────────────────────────────
  {
    // Living style guide for the team: tokens, StatusPill, buttons, toasts, IDE surfaces.
    path: '/_kit',
    name: 'ui-kit',
    component: () => import('@/views/KitView.vue'),
    meta: { title: 'UI kit' },
  },

  // ── Catch-all ─────────────────────────────────────────────────────────────
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/views/NotFoundView.vue'),
    meta: { title: 'Page not found', back: () => ({ label: 'Back' }) },
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior(to, from, savedPosition) {
    return savedPosition ?? { top: 0 }
  },
})

// Who may open a page (meta: auth, guest, roles). exported for its tests
export async function guard(to) {
  const auth = useAuthStore()

  // supabase-js restores the session from localStorage asynchronously, so the first
  // guarded navigation (like a refresh on /s/:id/code) must wait for it.
  if (!auth.loaded) await auth.ensureLoaded()

  if (to.meta.guest && auth.isAuthenticated) {
    return { name: 'home' }
  }

  if (to.meta.auth && !auth.isAuthenticated) {
    return { name: 'login', query: { returnTo: to.fullPath } }
  }

  // a new GitHub account picks its role before anything else, then carries on where it was going
  if (auth.needsRole && to.name !== 'choose-role') {
    return { name: 'choose-role', query: { returnTo: to.fullPath } }
  }
  if (!auth.needsRole && to.name === 'choose-role') return { name: 'home' }

  if (to.meta.roles && auth.role !== 'admin' && !to.meta.roles.includes(auth.role)) {
    useToastStore().show("You don't have access to that page", 'warning')
    return { name: 'courses' }
  }

  return true
}
router.beforeEach(guard)

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} · CodeAlong` : 'CodeAlong'
  try {
    sessionStorage.removeItem(reloadKey(to.fullPath)) // it opened, so a later deploy can reload again
  } catch {
    // blocked storage: nothing was kept
  }
})

// Each page's code is its own file, downloaded the first time it's opened. A deploy renames those
// files and removes the old ones, so a tab opened before it asks for files that are gone and the
// navigation would fail without a word. then the page is loaded fresh, which gets the new deploy.
// Only once per page (kept for this tab), so a file that's really broken can't reload forever.
const reloadKey = (path) => `codealong:reloaded:${path}`
const PAGE_DOWNLOAD_FAILED =
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i

/** What happens when a navigation throws. exported for its tests. */
export function onNavigationError(error, to) {
  if (PAGE_DOWNLOAD_FAILED.test(error?.message ?? '') && to) {
    let tried = true // without storage, never reload: it couldn't stop a loop
    try {
      tried = sessionStorage.getItem(reloadKey(to.fullPath)) === '1'
      sessionStorage.setItem(reloadKey(to.fullPath), '1')
    } catch {
      // blocked storage: fall through to the message
    }
    if (!tried) {
      window.location.assign(to.fullPath)
      return
    }
  }
  // anything else (or a reload that didn't help): say so, instead of a click that does nothing
  useToastStore().show(
    "That page didn't open. Check your connection, then reload the page.",
    'danger',
    { title: "Couldn't open the page" },
  )
}
router.onError(onNavigationError)

// the page you came from. A link opened directly has none, so go to the starting page instead.
export function goBack() {
  if (window.history.state?.back) router.back()
  else router.push({ name: useAuthStore().isAuthenticated ? 'home' : 'landing' })
}

export default router
