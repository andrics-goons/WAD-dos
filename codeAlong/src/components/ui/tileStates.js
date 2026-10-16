import { TileState } from '@shared/constants.js'

// Label + icon for each tile state. Colour comes from --ca-state-<state> tokens.
// Colour is never the only signal (IDP rule of thumb) — always render the icon and label too.
// Source of truth for meanings: design-docs/05-core-logic.md §4.
export const TILE_STATE_META = Object.freeze({
  [TileState.DONE]: {
    label: 'Done',
    icon: 'bi-check-circle-fill',
    hint: 'Finished the latest step',
  },
  [TileState.IN_PROGRESS]: {
    label: 'In progress',
    icon: 'bi-pencil-fill',
    hint: 'Working on the latest step',
  },
  [TileState.ERROR]: {
    label: 'Error',
    icon: 'bi-x-octagon-fill',
    hint: 'Last run threw or failed to compile',
  },
  [TileState.BEHIND]: {
    label: 'Behind',
    icon: 'bi-hourglass-split',
    hint: 'Two or more steps behind',
  },
  [TileState.IDLE]: { label: 'Idle', icon: 'bi-moon-fill', hint: 'No activity for a while' },
})

export function tileStateMeta(state) {
  return (
    TILE_STATE_META[state] ?? { label: state ?? 'Unknown', icon: 'bi-question-circle', hint: '' }
  )
}
