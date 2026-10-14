// Shared enums and limits — imported by the Vue app (Vite) and the Edge Functions (Deno).
// Nothing in shared/ may touch the DOM, window, Deno or the network.
// This file is a team contract: copied from design-docs/09-integration-contracts.md §1.
// Ping the team channel before changing it.

export const Role = Object.freeze({ PROF: 'prof', TA: 'ta', STUDENT: 'student' })
export const CourseRole = Object.freeze({ PROF: 'prof', TA: 'ta' })

export const LessonStatus = Object.freeze({ DRAFT: 'draft', READY: 'ready', ARCHIVED: 'archived' })
export const SessionStatus = Object.freeze({ LIVE: 'live', ENDED: 'ended' })

export const TileState = Object.freeze({
  DONE: 'done',
  IN_PROGRESS: 'in_progress',
  ERROR: 'error',
  BEHIND: 'behind',
  IDLE: 'idle',
})
// Grid sort order: most actionable first
export const TileStateOrder = [
  TileState.ERROR,
  TileState.BEHIND,
  TileState.IN_PROGRESS,
  TileState.IDLE,
  TileState.DONE,
]

export const SnapshotReason = Object.freeze({
  AUTOSAVE: 'autosave',
  BEFORE_CATCHUP: 'before_catchup',
  HELP_REQUEST: 'help_request',
})

export const HelpType = Object.freeze({ CHECK: 'check', HELP: 'help' })
export const HelpStatus = Object.freeze({
  OPEN: 'open',
  CLAIMED: 'claimed',
  PASSED: 'passed',
  REPLIED: 'replied',
  RESOLVED: 'resolved',
  CANCELLED: 'cancelled',
})

export const NoteKind = Object.freeze({ NOTE: 'note', BOOKMARK: 'bookmark' })

export const Limits = Object.freeze({
  MAX_FILES: 40, // a bare Vite scaffold is already ~10 files
  MAX_SNAPSHOT_BYTES: 200_000, // this is what protects the 5 GB egress budget
  // Never synced to Postgres: dependency and build output live only in WebContainer
  SYNC_IGNORE: ['node_modules/**', 'dist/**', '.vite/**', '.cache/**', 'pnpm-lock.yaml', '*.log'],
  BOOT_TIMEOUT_MS: 30_000, // no server-ready → "your project didn't start"
  INSTALL_TIMEOUT_MS: 120_000, // still streaming, but show a "still installing" state
  JOIN_CODE_LENGTH: 6,
  JOIN_CODE_ALPHABET: 'ABCDEFGHJKMNPQRSTUVWXYZ23456789',
  HEARTBEAT_MS: 30_000,
  IDLE_AFTER_SEC_DEFAULT: 180,
  SUMMARY_THROTTLE_MS: 1_000,
  STATUS_WRITE_THROTTLE_MS: 2_000,
  AUTOSAVE_DEBOUNCE_MS: 5_000, // fires 5 s after the last keystroke
  AUTOSAVE_FLUSH_ON_HIDE: true, // plus an immediate flush on blur / visibilitychange / unload
  RUN_DEBOUNCE_MS: 1_500,
  RUN_TIMEOUT_MS: 5_000,
  ERROR_MESSAGE_MAX: 300,
  ERROR_GROUP_MIN: 2,
  MAX_FOLLOW_UPS: 3, // per help request; past this the TA should walk over
  FOLLOW_UP_MAX_CHARS: 300,
  ANNOUNCE_MAX_CHARS: 200,
})

// Realtime broadcast event names (channel `session:<id>`)
export const RtEvent = Object.freeze({
  CHECKPOINT_NEW: 'checkpoint:new',
  SESSION_SETTINGS: 'session:settings',
  SESSION_ENDED: 'session:ended',
  SPOTLIGHT_SHOW: 'spotlight:show',
  SPOTLIGHT_HIDE: 'spotlight:hide',
  ANNOUNCE: 'session:announce', // text null = cleared
})

// Edge Function names (supabase.functions.invoke)
export const Fn = Object.freeze({
  GITHUB_IMPORT: 'github-import',
  GITHUB_EXPORT: 'github-export',
  SPOTLIGHT: 'spotlight',
  HINT: 'hint',
  DIGEST: 'digest',
})
