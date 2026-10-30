// works out a student's tile state (design-docs/05-core-logic.md §4)
// the same rule as the session_tiles view in sql, so the dashboard can re-colour tiles in the
// browser without asking the db again. tests/unit/rls/tile-state.test.js checks they agree
//
//   classify({ doneSeq, checkpointSeq, error, lastSeenAt, now, idleAfterMs }) -> TileState
//     doneSeq        the checkpoint the student clicked Done on (0 = the starter), or null
//     checkpointSeq  the class's latest checkpoint (0 before the first one)
//     error          their last error, or null
//     lastSeenAt     their last heartbeat: a date, a timestamp or an iso string
//     now            the time to compare with, defaults to Date.now()
//     idleAfterMs    how long without a heartbeat counts as idle, defaults to 180 s

import { Limits, TileState } from './constants.js'

export function classify({
  doneSeq,
  checkpointSeq,
  error,
  lastSeenAt,
  now = Date.now(),
  idleAfterMs = Limits.IDLE_AFTER_SEC_DEFAULT * 1000,
}) {
  // idle beats everything, then an error
  if (now - new Date(lastSeenAt).getTime() > idleAfterMs) return TileState.IDLE
  if (error) return TileState.ERROR
  // done only on the latest checkpoint: a new one puts everyone back to in progress
  if ((doneSeq ?? null) === (checkpointSeq ?? null)) return TileState.DONE
  return TileState.IN_PROGRESS
}
