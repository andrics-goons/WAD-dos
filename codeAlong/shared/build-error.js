import { Limits } from "./constants.js"

// the first line of a Vite error, and the lines that mean it compiles again
// creates a regex object to help with checking if its a start of an error or recovered
// ERROR_LABEL is everything in front of the message, e.g. "9:18:41 PM [vite] (client) Pre-transform error: "
// Vite 8 adds "(client)", and says "Pre-transform error" when the page loads or "Internal server error" when a file is requested
const ERROR_LABEL = /^.*?\[vite\] (?:\([\w-]+\) )?(?:Internal server error|Pre-transform error):\s*/
const RECOVERED = /hmr update|page reload|ready in/
// concurrently (the lesson's dev script) puts its name in front of every line, e.g. "[web]   File: ..."
// [vite] is Vite's own label, so it's left alone
const PREFIX = /^\[(?!vite\])[\w-]+\] ?/

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

// reads every line outputted by the terminal and finds vite errors
export function createBuildErrorReader (onError) {
    // defines the mode of the error reader when null (watching for error) or an array (collecting lines)
    let block = null

    // calls the parseBuildError function once all the needed output is collected and reset the block 
    function finish () {
        // appends the array elements (lines pushed from jsh) into the parseBuildError
        const err = parseBuildError(block.join("\n"))
        block = null
        // chcekcs if the error was properly parsed
        if (err) {
            onError(err)
        }
    }

    return (line) => {
        // remove the "[web] " first, or the indent check below fails and the block ends before the File: line
        line = line.replace(PREFIX, "")

        if (block) {
            // checks if the line is indented, all of the info needed shld be under the [vite] line with indents
            if (/^\s+\S/.test(line)) {
                block.push(line)
                // only need up till "File:" line, call the finish function and call now
                if (line.trim().startsWith("File:")) {
                    finish()
                }
                return
            }
            // anything else ends the error, then gets checked like any other line below
            finish()
        }
        // checks if its the start of an error
        if (ERROR_LABEL.test(line)) {
            block = [line]
        }
        // checks if its recovered instead, disregard
        else if (RECOVERED.test(line)) { 
            onError(null) 
        }
    }
}