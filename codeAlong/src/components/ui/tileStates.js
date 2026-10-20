import { TileState } from '@shared/constants.js'

// The text and icon for each student state. The colour comes from tokens.css.
// Always show the icon and text too, so the state isn't told by colour alone.
export const TILE_STATE_META = Object.freeze({
  [TileState.DONE]: { label: 'Done', icon: 'bi-check-circle-fill' },
  [TileState.IN_PROGRESS]: { label: 'In progress', icon: 'bi-pencil-fill' },
  [TileState.ERROR]: { label: 'Error', icon: 'bi-x-octagon-fill' },
  [TileState.BEHIND]: { label: 'Behind', icon: 'bi-hourglass-split' },
  [TileState.IDLE]: { label: 'Idle', icon: 'bi-moon-fill' },
})

export function tileStateMeta(state) {
  return TILE_STATE_META[state] ?? { label: state ?? 'Unknown', icon: 'bi-question-circle' }
}
