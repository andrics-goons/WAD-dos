// Keeps the container's files in step with the editor, so the dev server (and the preview) see every edit.
// No Vue in here: the container is passed in, same idea as connectShell.

/**
 * Write one file's new content into the container.
 * Creates the file's folder first if it doesn't exist yet (e.g. a brand new "src/utils/" file).
 *
 * @param {object} webcontainer the booted WebContainer
 * @param {string} path e.g. "src/App.vue" or "index.html"
 * @param {string} content the file's full new content
 * @returns {Promise<void>}
 */
export async function writeToContainer(webcontainer, path, content) {
    // TODO: make sure the file's folder exists (a file at the root has no folder)

    // TODO: write the content to the file
    throw new Error("TODO")
}

/**
 * Wrap fn(path, content) so that, for each path, it only runs once edits to that path
 * have paused for `ms` milliseconds, with the latest content.
 * Different paths don't cancel each other.
 *
 * @param {(path: string, content: string) => void} fn
 * @param {number} ms
 * @returns {(path: string, content: string) => void}
 */
export function debounceByPath(fn, ms) {
    // TODO: remember a pending timer per path

    // TODO: return a function that restarts that path's timer each time it's called
    throw new Error("TODO")
}
