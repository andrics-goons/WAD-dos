import { WebContainer } from "@webcontainer/api"
import { PREVIEW_NAV_SCRIPT } from "./previewNav.js"

// bootPromise shared by every call
let bootPromise = null


export function getWebContainer() {
    if (!bootPromise) {
        // no await so that when a second call is made it wont create another instance but just use this one instead
        bootPromise = WebContainer.boot().then(async (webcontainer) => {
            // lets the preview's Back button work (previewNav.js); a preview without it still runs
            try {
                await webcontainer.setPreviewScript(PREVIEW_NAV_SCRIPT)
            } catch {
                // the preview just has no working Back
            }
            return webcontainer
        })
    }
    return bootPromise
}

export function toFileSystemTree(files) {
    const tree = {}

    for (const { path, content } of files) {
        const parts = path.split("/")
        if (parts.includes("node_modules")) {
            continue
        }
        const fileName = parts.pop()
        let current = tree
        for (const folder of parts) {
            if (!current[folder]) current[folder] = { directory: {} }
            current = current[folder].directory
        }

        current[fileName] = { file: { contents: content } }
    }

    return tree
}