import { toFileSystemTree } from "./webcontainer"
import { restorePackages, watchInstalls } from "./install"

export async function startWorkspace(webcontainer, files, onServerReady) {
    // mount files to the webcontainer
    // requires files to be in tree format
    await webcontainer.mount(toFileSystemTree(files))

    // put back the packages saved on this device after an earlier install (src/runtime/install.js),
    // then save them again whenever an install finishes. watching starts after the restore, so
    // restoring doesn't count as an install
    await restorePackages(webcontainer)
    const stopWatching = watchInstalls(webcontainer)

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
        stopWatching()
    }
}
