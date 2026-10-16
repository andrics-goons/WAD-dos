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

    // On mounted, create the xterm instance, attach it to the page, then connect it to the shell
    onMounted(async () => {
        // create a fresh terminal for this component connect it to the div
        term = createTerminal(terminalEl.value)
        webcontainer = await getWebContainer()
        disconnectShell = await connectShell(webcontainer, term)

    })

    // Before unmount, clean up so leaving the page doesn't leave a terminal or shell running
    onBeforeUnmount(() => {
        // TODO: stop watching for resizes, and destroy the terminal
        disconnectShell?.() 
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
