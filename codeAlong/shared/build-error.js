import { Limits } from "./constants.js"

// the first line of a Vite error
// creates a regex object to help with checking if its a start of an error
// ERROR_LABEL is everything in front of the message, e.g. "9:18:41 PM [vite] (client) Pre-transform error: "
// Vite 8 adds "(client)", and says "Pre-transform error" when the page loads or "Internal server error" when a file is requested
// exported so error-reader.js spots errors with the same regex this file removes
export const ERROR_LABEL = /^.*?\[vite\] (?:\([\w-]+\) )?(?:Internal server error|Pre-transform error):\s*/

// reads one finished vite error block
// returns { source: "build", name, message, file, line }, or null if it isn't a vite error
export function parseBuildError (text) {
    // joining and splitting again just for the sake of test files
    const lines = String(text ?? "").split("\n")
    // guard checks if the text is actually an error
    if (!ERROR_LABEL.test(lines[0])) return null

    // message: the first line without the [vite] label
    const message = lines[0].replace(ERROR_LABEL, "").trim().slice(0, Limits.ERROR_MESSAGE_MAX)   // the database rejects anything longer
    if (!message) { 
        return null 
    }

    // file and line: from "  File: /home/abc123/src/App.vue:4:22"
    // cannot automatically assume file line is at index 
    const fileLine = lines.find((l) => l.trim().startsWith("File:"))
    // splits the fileLine into its different components in ()
    const match = fileLine?.match(/File:\s*(\S+?)(?::(\d+)(?::\d+)?)?\s*$/)
    let file = match?.[1] ?? null
    if (file) {
        // drop vite's "?vue&type=script" ending, then make the path start at the project, e.g. "src/App.vue"
        file = file.split("?")[0]
        const src = file.indexOf("/src/")
        file = src >= 0 ? file.slice(src + 1) : file.replace(/^\/+/, "")
    }

    return {
        source: "build",
        name: "BuildError",
        message,
        file,
        line: match?.[2] ? Number(match[2]) : null,
    }
}
