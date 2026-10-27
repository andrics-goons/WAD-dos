import { Limits } from "./constants.js"

// tidies the error ca-probe.js sent into the same shape as parseBuildError, so reportError
// can treat both the same way. raw = { name, message, filename, lineno }, parsed from the "ca-error" line
// returns { source: "runtime", name, message, file, line }, or null if there's nothing usable
export function parseRuntimeError (raw) {
    // raw came from JSON.parse, so it could be anything
    if (!raw || typeof raw !== "object") return null

    // message: the first line only, without the "Uncaught " the browser adds
    let message = String(raw.message ?? "").split("\n")[0].replace(/^Uncaught\s+/, "").trim()
    let name = raw.name || null

    // without the error object, the browser's message is "ReferenceError: itmes is not defined".
    // move the name out, or normalizeError would make "ReferenceError: ReferenceError: ..."
    const named = message.match(/^(\w+): (.*)$/)
    if (named && (!name || named[1] === name)) {
        name = named[1]
        message = named[2]
    }

    // "Script error." is all the browser says about errors from other origins: nothing to show the prof
    if (!message || message === "Script error.") return null

    return {
        source: "runtime",
        name: name ?? "Error",
        message: message.slice(0, Limits.ERROR_MESSAGE_MAX),   // the database rejects anything longer
        file: projectPath(raw.filename),
        line: Number(raw.lineno) > 0 ? Number(raw.lineno) : null,   // 0 means the browser doesn't know
    }
}

// "http://localhost:5173/src/components/ItemCard.vue?t=1730000000" → "src/components/ItemCard.vue"
// null or "" (failed promises have no file) → null
function projectPath (filename) {
    if (!filename) return null
    let path
    try {
        // pathname is the part after the address, without "?t=..."
        path = new URL(filename).pathname
    } catch {
        // not a full URL: just drop anything after "?"
        path = String(filename).split("?")[0]
    }
    // same cut as parseBuildError: start the path at the project
    const src = path.indexOf("/src/")
    return src >= 0 ? path.slice(src + 1) : path.replace(/^\/+/, "") || null
}
