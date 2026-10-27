import { toFileSystemTree } from "./webcontainer"

export async function startWorkspace(webcontainer, files, onServerReady) {
    // mount files to the webcontainer
    // requires files to be in tree format 
    await webcontainer.mount(toFileSystemTree(files))

    // registering a listener, return the url to the vue component (inspect frame at port 5173)
    // calling off() removes the listener

    const off = webcontainer.on("server-ready", (port, url) => {
        if (port === 5173) {
            onServerReady(url)
        }
    })

    // returning the stop function
    return () => {
        off()
    }
}
