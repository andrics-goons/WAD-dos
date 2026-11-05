// how a checkpoint is named on every screen and in the Telegram ping:
// "Checkpoint 3 · Added ItemCard", "Checkpoint 3" when the prof gave no title, and
// "Starter code" for seq 0, the class before the prof's first checkpoint.
// pure, so the Vue app and the Edge Functions share it.
export function checkpointLabel(seq, title = null) {
  if (!seq) return 'Starter code'
  return title ? `Checkpoint ${seq} · ${title}` : `Checkpoint ${seq}`
}
