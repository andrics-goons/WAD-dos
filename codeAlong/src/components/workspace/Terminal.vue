<script setup>
    import { ref, onMounted, onBeforeUnmount } from "vue"
    // Function that creates xterm instance 
    import { createTerminal } from "@/runtime/terminal.js"
    // Connects the terminal to a shell inside the WebContainer
    import { connectShell } from "@/runtime/shell.js"
    import { getWebContainer } from "@/runtime/webcontainer.js"

    // Creating terminal element
    const terminalEl = ref(null)

    let term
    let webcontainer
    let disconnectShell // the return function that will disconnect the shell
    // set on unmount, so a boot or spawn that finishes after the user has left doesn't start a shell nobody will kill
    let unmounted = false

    // On mounted, create the xterm instance, attach it to the page, then connect it to the shell
    onMounted(async () => {
        // create a fresh terminal for this component connect it to the div
        term = createTerminal(terminalEl.value)
        try {
            webcontainer = await getWebContainer()
            if (unmounted) return
            const disconnect = await connectShell(webcontainer, term)
            // the shell started after we unmounted, so kill it straight away
            if (unmounted) disconnect()
            else disconnectShell = disconnect
        } catch (e) {
            // WorkspaceView shows the full error, this just explains the empty terminal
            if (!unmounted) term.write(`\x1b[31mCouldn't start the terminal: ${e.message}\x1b[0m\r\n`)
        }
    })

    // Before unmount, clean up so leaving the page doesn't leave a terminal or shell running
    onBeforeUnmount(() => {
        unmounted = true
        disconnectShell?.()
        term?.dispose()
    })
</script>

<template>
    <div ref="terminalEl" class="terminal"></div>
</template>

<style scoped>
    .terminal {
        height: 100%;
        width: 100%;
    }
</style>
