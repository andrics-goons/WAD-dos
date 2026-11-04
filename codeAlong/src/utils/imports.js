// Which files point at a file by name, so moving or renaming it would break them: an import
// (`import ItemCard from './components/ItemCard.vue'`, `import './style.css'`, a dynamic
// `import('./x')`), a `require('./x')`, a `new URL('./data.json', import.meta.url)`, an HTML
// `src="/src/main.js"`, or the whole path in a .json file (package.json's "node server/api.js"; a
// path in a code comment or the .md docs is only words). It goes by the file's name, not by
// resolving paths, so it errs towards warning: `./ItemCard` (no extension) counts too.

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The paths of the files (other than `path` itself) that refer to `path`, in their order. */
export function importersOf(files, path) {
  const name = path.split('/').pop()
  const stem = name.replace(/\.(js|vue)$/, '') // Vite resolves these without the extension
  const names = [...new Set([name, stem])].map(escape).join('|')
  const quoted = `['"\`](?:[^'"\`\\n]*/)?(?:${names})['"\`]`
  const ref = new RegExp(
    `(?:\\bfrom\\s*|\\bimport\\s*\\(?\\s*|\\brequire\\(\\s*|\\bURL\\(\\s*|\\bsrc\\s*=\\s*)${quoted}`,
  )
  const mentions = (f) => f.path.endsWith('.json') && f.content.includes(path)
  return files
    .filter((f) => f.path !== path && (ref.test(f.content) || mentions(f)))
    .map((f) => f.path)
}
