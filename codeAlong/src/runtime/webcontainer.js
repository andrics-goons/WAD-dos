import { WebContainer } from "@webcontainer/api"

// bootPromise shared by every call
let bootPromise = null


export function getWebContainer() {
    if (!bootPromise) {
        // no await so that when a second call is made it wont create another instance but just use this one instead
        bootPromise = WebContainer.boot()
    }
    return bootPromise
}

export function toFileSystemTree(files) {
    const tree = {}

    for (const { path, content } of files) {
        const parts = path.split("/") 
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