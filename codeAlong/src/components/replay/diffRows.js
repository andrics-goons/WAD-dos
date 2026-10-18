// Turns one hunk's lines (from diffSummary) into rows for DiffView's side-by-side mode.
// Within a block of changes, the 1st removed line sits next to the 1st added line, and so on;
// leftover lines get an empty cell on the other side. Unchanged lines appear on both sides.
//   splitRows(lines) -> [{ left: line | null, right: line | null }]
export function splitRows(lines) {
  const rows = []
  let removed = []
  let added = []

  // Write out the current block of changes as paired rows
  const pairUp = () => {
    const n = Math.max(removed.length, added.length)
    for (let i = 0; i < n; i++) rows.push({ left: removed[i] ?? null, right: added[i] ?? null })
    removed = []
    added = []
  }

  for (const line of lines) {
    if (line.type === 'del') removed.push(line)
    else if (line.type === 'add') added.push(line)
    else {
      pairUp()
      rows.push({ left: line, right: line })
    }
  }
  pairUp()
  return rows
}
