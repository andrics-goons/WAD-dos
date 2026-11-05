// importing xterm and renaming it to prevent confusion with the Terminal.vue component
import { Terminal as XTerm } from "@xterm/xterm"
// addon that works out how many cols/rows fit inside the element
import { FitAddon } from "@xterm/addon-fit"
// xterm's stylesheet
import "@xterm/xterm/css/xterm.css"


// the terminal's look: the editor's dark colours (--ca-ide-* in tokens.css) and the app's code
// font, so it sits in the code area instead of looking like a black box pasted in.
// xterm can't read CSS variables, so the colours are copied here; the palette is GitHub-dark
// style to go with them. only looks: nothing about how the terminal works changes
const FONT = '"JetBrains Mono Variable", ui-monospace, Menlo, Consolas, monospace'
const THEME = {
    background: "#0d1117",          // --ca-ide-bg
    foreground: "#e6edf3",          // --ca-ide-text
    cursor: "#818cf8",              // --ca-ide-accent
    selectionBackground: "#818cf855",
    black: "#484f58",
    red: "#ff7b72",
    green: "#3fb950",
    yellow: "#d29922",
    blue: "#58a6ff",
    magenta: "#bc8cff",
    cyan: "#39c5cf",
    white: "#b1bac4",
    brightBlack: "#6e7681",
    brightRed: "#ffa198",
    brightGreen: "#56d364",
    brightYellow: "#e3b341",
    brightBlue: "#79c0ff",
    brightMagenta: "#d2a8ff",
    brightCyan: "#56d4dd",
    brightWhite: "#f0f6fc",
    // a thin VS Code-style scrollbar: a soft grey slider on no track, a bit brighter when used
    scrollbarSliderBackground: "#79797966",
    scrollbarSliderHoverBackground: "#646464b3",
    scrollbarSliderActiveBackground: "#bfbfbf66",
}

export function createTerminal(el) {
    // creating terminal instance
    const term = new XTerm({
        cursorBlink: true,
        cursorStyle: "bar",
        fontFamily: FONT,
        fontSize: 13,
        lineHeight: 1.2,
        theme: THEME,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)

    term.open(el)
    // size it to the element straight away so the shell spawns with the right cols/rows
    fitAddon.fit()
    // measured again once the font has loaded: until then xterm sizes its cells with a fallback
    // font, and lines would wrap in the wrong place. A terminal closed before that is left alone
    document.fonts.load(`13px ${FONT}`).then(() => {
        if (term.element) fitAddon.fit()
    }).catch(() => {})
    return { term, fitAddon }
}
