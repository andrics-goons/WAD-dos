export async function connectShell(webcontainer, term) {
    // create shell process in webcontainer
    const shell = await webcontainer.spawn("jsh", {
        terminal:{ cols: term.cols, rows: term.rows }  //meant for resizing, TODO LATER
    })

    // writing shell outputs into the terminal
    shell.output.pipeTo(
        new WritableStream({
            write(data) {
                term.write(data)
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
