// Importing xterm and renaming it to prevent confusion with the Terminal.vue component
import { Terminal as XTerm } from "@xterm/xterm"
// Addon that works out how many cols/rows fit inside the element
import { FitAddon } from "@xterm/addon-fit"
// xterm's stylesheet
import "@xterm/xterm/css/xterm.css"


export function createTerminal(el) {
    // creating terminal instance
    const term = new XTerm({
        cursorBlink: true
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)

    term.open(el)
    // size it to the element straight away so the shell spawns with the right cols/rows
    fitAddon.fit()
    return { term, fitAddon }
}
