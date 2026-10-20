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

    // // starts pnpm install after listener is registed, await only waits for process to start 
    // const install = await webcontainer.spawn("pnpm", ["install"])
    // // additional await to wait for the install to finish before moving on
    // const installExitCode = await install.exit
    // // error handler if promise fails
    // if (installExitCode !== 0) {
    //     off()
    //     throw new Error(`pnpm install failed: ${installExitCode}`)
    // }

    // returning the stop function
    return () => {
        // dev.kill()
        off()
    }
}
