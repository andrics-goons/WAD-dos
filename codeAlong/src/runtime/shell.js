


export async function connectShell(webcontainer, term) {
    // create shell process in webcontainer
    const shell = await webcontainer.spawn("jsh", {
        terminal:{ cols: term.cols, rows: term.rows }  //meant for resizing, do i rly need this
    })

    // writing shell outputs into the terminal
    shell.output.pipeTo(
        new WritableStream({
            write(data) {
                term.write(data)
            }
        })
    )

    // creating writer instance and using onData listener for keystrokes and writing into input
    const input = shell.input.getWriter()
    term.onData((data) => {
        input.write(data)
    })

    // need to create a resizer
    // need to create an undo everything above
}
