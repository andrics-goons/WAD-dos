import { stripAnsi, createLineSplitter } from "./output.js"
import { createErrorReader } from "@shared/error-reader.js"

export async function connectShell(webcontainer, term, { onError } = {}) {
    // create shell process in webcontainer
    const shell = await webcontainer.spawn("jsh", {
        terminal:{ cols: term.cols, rows: term.rows }  //meant for resizing, TODO LATER
    })

    const pushLine = createErrorReader(onError)
    const pushChunk = createLineSplitter((line => pushLine(stripAnsi(line))))

    // writing shell outputs into the terminal
    shell.output.pipeTo(
        new WritableStream({
            write(data) {
                term.write(data)
                // goes into the splitter if a chunk exists, turns the chunks returned by jsh into lines
                try {
                    pushChunk(data)
                } catch (e) {
                    console.error(e)
                }
            }
            
        })
    )

    // create writer instance
    const input = shell.input.getWriter()
    // listen to keystrokes using onData
    const keystrokes = term.onData((data) => {
        input.write(data)

    })

    // need to create a resizer TODO LATER

    // return disconnect function
    return () => {
        // stop sending keystrokes to shell
        keystrokes.dispose()
        // kill the shell
        shell.kill()
    }
}
