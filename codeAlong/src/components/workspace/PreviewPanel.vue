<script setup>
    import { ref } from "vue"

    const props = defineProps({
        // url the webcontainer's dev server gives us, empty until it's ready
        previewUrl: { type: String, default: "" },
    })

    const emit = defineEmits(["show-editor"])

    const poppedOut = ref(false)

    // Our Cross-Origin-Opener-Policy header cuts this page off from any popup on another
    // origin, so we can't see when the popup closes or close it ourselves. noopener just
    // makes that explicit. The user brings the preview back with the button instead.
    function popOut() {
        window.open(props.previewUrl, "_blank", "popup,noopener,width=1000,height=700")
        poppedOut.value = true
    }

    function bringBack() {
        poppedOut.value = false
    }
</script>

<template>
    <div class="preview-panel">
        <!-- Pane header -->
        <div class="pane-header">
            <span>Preview</span>
            <div class="d-flex gap-3">
                <!-- Pop out button -->
                <button
                    class="toggle-btn"
                    type="button"
                    title="Open preview in a new window"
                    :disabled="!previewUrl"
                    @click="popOut"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-box-arrow-up-right" viewBox="0 0 16 16">
                        <path fill-rule="evenodd" d="M8.636 3.5a.5.5 0 0 0-.5-.5H1.5A1.5 1.5 0 0 0 0 4.5v10A1.5 1.5 0 0 0 1.5 16h10a1.5 1.5 0 0 0 1.5-1.5V7.864a.5.5 0 0 0-1 0V14.5a.5.5 0 0 1-.5.5h-10a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5h6.636a.5.5 0 0 0 .5-.5"/>
                        <path fill-rule="evenodd" d="M16 .5a.5.5 0 0 0-.5-.5h-5a.5.5 0 0 0 0 1h3.793L6.146 9.146a.5.5 0 1 0 .708.708L15 1.707V5.5a.5.5 0 0 0 1 0z"/>
                    </svg>
                </button>
                <!-- below xl the editor isn't beside the preview, so this swaps back to it -->
                <button
                    class="toggle-btn d-xl-none"
                    type="button"
                    title="Show code"
                    @click="emit('show-editor')"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-code-slash" viewBox="0 0 16 16">
                        <path d="M10.478 1.647a.5.5 0 1 0-.956-.294l-4 13a.5.5 0 0 0 .956.294zM4.854 4.146a.5.5 0 0 1 0 .708L1.707 8l3.147 3.146a.5.5 0 0 1-.708.708l-3.5-3.5a.5.5 0 0 1 0-.708l3.5-3.5a.5.5 0 0 1 .708 0m6.292 0a.5.5 0 0 0 0 .708L14.293 8l-3.147 3.146a.5.5 0 0 0 .708.708l3.5-3.5a.5.5 0 0 0 0-.708l-3.5-3.5a.5.5 0 0 0-.708 0"/>
                    </svg>
                </button>
            </div>
        </div>

        <div class="pane-body">
            <!-- iframe is hidden while popped out so the app isn't running twice -->
            <iframe v-if="previewUrl && !poppedOut" :src="previewUrl"></iframe>

            <div v-else-if="poppedOut" class="popped-out">
                <span>Preview is open in a separate window</span>
                <button type="button" class="btn btn-sm btn-outline-secondary" @click="bringBack">
                    Show preview here
                </button>
            </div>

            <!-- before the dev server gives us a url, the body is left empty inside the outline -->
        </div>
    </div>
</template>

<style scoped>
    .preview-panel {
        display: flex;
        flex-direction: column;
        height: 100%;
        border: 1px solid var(--ca-border-strong);
        border-radius: var(--ca-radius);
        overflow: hidden;
    }
    /* same height as EditorPanel's headers so the two sides line up */
    .pane-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        min-height: 42px;
        padding: 10px 16px;
        background: var(--ca-surface-muted);
        border-bottom: 1px solid var(--ca-border-strong);
        font-size: 14px;
        user-select: none;
    }
    .pane-body {
        flex: 1;
        min-height: 0;
    }
    .pane-body iframe {
        display: block;
        width: 100%;
        height: 100%;
        border: none;
    }
    .toggle-btn {
        display: flex;
        padding: 0;
        border: none;
        background: none;
        color: var(--ca-text-muted);
        cursor: pointer;
    }
    .toggle-btn:hover:not(:disabled) {
        color: var(--ca-text);
    }
    .toggle-btn:disabled {
        opacity: 0.4;
        cursor: default;
    }
    .popped-out {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: var(--ca-space-3);
        height: 100%;
        color: var(--ca-text-muted);
        font-size: 14px;
    }
</style>
