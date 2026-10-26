import { HelpStatus, HelpType } from '@shared/constants.js'

// Words, icons and colours for help requests, the same on every help screen.
// The colours reuse the student-state tokens (ca-state--*) so nothing new is styled.
export const HELP_STATUS_META = Object.freeze({
  [HelpStatus.OPEN]: { label: 'Waiting', icon: 'bi-hourglass-split', tone: 'behind' },
  [HelpStatus.CLAIMED]: { label: 'Claimed', icon: 'bi-person-check', tone: 'in_progress' },
  [HelpStatus.PASSED]: { label: 'Passed', icon: 'bi-check-circle-fill', tone: 'done' },
  [HelpStatus.REPLIED]: { label: 'Replied', icon: 'bi-reply-fill', tone: 'done' },
  [HelpStatus.RESOLVED]: { label: 'Resolved', icon: 'bi-check-circle-fill', tone: 'done' },
  [HelpStatus.CANCELLED]: { label: 'Cancelled', icon: 'bi-x-circle', tone: 'idle' },
})

export const HELP_TYPE_LABEL = Object.freeze({
  [HelpType.CHECK]: 'Check my work',
  [HelpType.HELP]: 'Help',
})

// Still in the queue: nobody has finished with it yet
export const isActive = (request) => [HelpStatus.OPEN, HelpStatus.CLAIMED].includes(request.status)

// When the student last asked: the opening message, or their latest follow-up, so a
// follow-up doesn't show as waiting since the start of class
export function askedAt(request) {
  const lastFollowUp = request.thread.findLast((entry) => entry.role === 'student')
  return lastFollowUp?.at ?? request.created_at
}

// "just now", "4 min", "1 h 5 min"
export function waitingFor(since, now) {
  const minutes = Math.floor((now - new Date(since)) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`
}

// Who replied last, for "Follow-up · last handled by Ana"
export function lastHandledBy(request, staffNames) {
  const lastReply = request.thread.findLast((entry) => entry.role === 'staff')
  return lastReply ? (staffNames[lastReply.author_id] ?? 'a TA') : null
}
