// Importing xterm and renaming it to prevent confusion with the Terminal.vue component
import { Terminal as XTerm } from "@xterm/xterm"
// xterm's stylesheet
import "@xterm/xterm/css/xterm.css"


export function createTerminal(el) {
    // creating terminal instance
    const term = new XTerm({
        cursorBlink: true
    })

    term.open(el)
    return term
}
