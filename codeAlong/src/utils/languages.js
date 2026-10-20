import { javascript } from "@codemirror/lang-javascript"
import { html } from "@codemirror/lang-html"
import { css } from "@codemirror/lang-css"
import { vue } from "@codemirror/lang-vue"

// getting the extension from the filename
export function getExtension(filename) {
    const dot = filename.lastIndexOf(".")
    // if no extension i.e. the readme file
    if (dot === -1) {
        return ""
    }
    return filename.slice(dot + 1).toLowerCase()
}

// mapping the extension to the appropraite codemirror language
const LANGUAGES = {
    js: () => javascript(),  // stores the function itself rather than the output
    html: () => html(),
    css: () => css(),
    vue: () => vue(),
}

// return the approriate file language from the filename 
export function languageFor(filename) {
    const makeLanguage = LANGUAGES[getExtension(filename)]
    return makeLanguage ? makeLanguage() : []
}
