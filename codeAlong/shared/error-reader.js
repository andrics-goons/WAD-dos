import { parseBuildError, ERROR_LABEL } from "./build-error.js"
import { parseRuntimeError } from "./runtime-error.js"

// the start of the line the lesson's vite.config.js prints for a runtime error,
// e.g. 'ca-error {"name":"ReferenceError","message":"itmes is not defined",...}'
const RUNTIME_MARK = "ca-error "

// the lines that mean it compiles again
const RECOVERED = /hmr update|page reload|ready in/
// concurrently (the lesson's dev script) puts its name in front of every line, e.g. "[web]   File: ..."
// [vite] is Vite's own label, so it's left alone
const PREFIX = /^\[(?!vite\])[\w-]+\] ?/

// reads every line outputted by the terminal and finds vite errors
export function createErrorReader (onError) {
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
        // a runtime error from the student's app: one line of JSON, so there's no block to collect
        if (line.startsWith(RUNTIME_MARK)) {
            try {
                const err = parseRuntimeError(JSON.parse(line.slice(RUNTIME_MARK.length)))
                if (err) {
                    onError(err)
                }
            } catch {
                // not valid JSON, so it wasn't really from the plugin: ignore it
            }
            return
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
