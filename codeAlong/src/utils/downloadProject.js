// Save the student's project to their computer as a .zip, before loading the prof's checkpoint
// replaces it (design-docs/05 §7). Everything happens in the browser: nothing is uploaded.
// The workspace only holds source files, so there's no node_modules to leave out.
//
//   downloadProject(workspaceStore.files, 'Week 6 · Mini Cart')   → "week-6-mini-cart.zip"
import { strToU8, zipSync } from 'fflate' // Source: https://github.com/101arrowz/fflate (MIT)

// "Week 6 · Mini Cart" → "week-6-mini-cart"
const fileName = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'project'

// the zip itself, kept separate so tests can unzip it. Everything sits in one folder named
// after the lesson, so "Extract here" doesn't scatter the files into Downloads.
export function zipProject(files, name = 'project') {
  const folder = fileName(name)
  return zipSync(Object.fromEntries(files.map((f) => [`${folder}/${f.path}`, strToU8(f.content)])))
}

export function downloadProject(files, name) {
  const url = URL.createObjectURL(new Blob([zipProject(files, name)], { type: 'application/zip' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `${fileName(name)}.zip`
  link.click()
  // released a moment later: revoking straight away can cancel the download in some browsers
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
