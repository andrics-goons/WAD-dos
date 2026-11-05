<script setup>
    import { ref } from "vue"
    import { usePreviewNav } from "@/runtime/previewNav.js"

    const props = defineProps({
        // url the webcontainer's dev server gives us, empty until it's ready
        previewUrl: { type: String, default: "" },
        switchable: { type: Boolean, default: false }, // show the code button at every size, e.g. the teach view
        view: { type: String, default: null }, // 'split' or 'full' shows the view button (student workspace)
    })

    const emit = defineEmits(["show-editor", "toggle-view"])

    const poppedOut = ref(false)

    // back, forward and reload, like a browser's, for the app's own pages
    const { frame, frameKey, canGoBack, canGoForward, back, forward, reload } = usePreviewNav()

    // our Cross-Origin-Opener-Policy header cuts this page off from any popup on another
    // origin, so we can't see when the popup closes or close it ourselves. noopener just
    // makes that explicit. the user brings the preview back with the button instead.
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
        <!-- pane header -->
        <div class="pane-header">
            <!-- on the left, like a browser's: Back, Forward, Reload -->
            <div class="d-flex align-items-center gap-3">
                <button
                    class="toggle-btn"
                    type="button"
                    title="Back"
                    :disabled="!canGoBack || poppedOut"
                    @click="back"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-arrow-left" viewBox="0 0 16 16">
                        <path fill-rule="evenodd" d="M15 8a.5.5 0 0 0-.5-.5H2.707l3.147-3.146a.5.5 0 1 0-.708-.708l-4 4a.5.5 0 0 0 0 .708l4 4a.5.5 0 0 0 .708-.708L2.707 8.5H14.5A.5.5 0 0 0 15 8"/>
                    </svg>
                </button>
                <button
                    class="toggle-btn"
                    type="button"
                    title="Forward"
                    :disabled="!canGoForward || poppedOut"
                    @click="forward"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-arrow-right" viewBox="0 0 16 16">
                        <path fill-rule="evenodd" d="M1 8a.5.5 0 0 1 .5-.5h11.793l-3.147-3.146a.5.5 0 0 1 .708-.708l4 4a.5.5 0 0 1 0 .708l-4 4a.5.5 0 0 1-.708-.708L13.293 8.5H1.5A.5.5 0 0 1 1 8"/>
                    </svg>
                </button>
                <button
                    class="toggle-btn"
                    type="button"
                    title="Reload"
                    :disabled="!previewUrl || poppedOut"
                    @click="reload"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-arrow-clockwise" viewBox="0 0 16 16">
                        <path fill-rule="evenodd" d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2z"/>
                        <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466"/>
                    </svg>
                </button>
                <span class="ms-1">Preview</span>
            </div>
            <div class="d-flex gap-3">
                <!-- pop out button -->
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
                <!-- below xl the editor isn't beside the preview, so this swaps back to it (always, when switchable) -->
                <button
                    class="toggle-btn"
                    :class="{ 'd-xl-none': !switchable }"
                    type="button"
                    title="Show code"
                    @click="emit('show-editor')"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-code-slash" viewBox="0 0 16 16">
                        <path d="M10.478 1.647a.5.5 0 1 0-.956-.294l-4 13a.5.5 0 0 0 .956.294zM4.854 4.146a.5.5 0 0 1 0 .708L1.707 8l3.147 3.146a.5.5 0 0 1-.708.708l-3.5-3.5a.5.5 0 0 1 0-.708l3.5-3.5a.5.5 0 0 1 .708 0m6.292 0a.5.5 0 0 0 0 .708L14.293 8l-3.147 3.146a.5.5 0 0 0 .708.708l3.5-3.5a.5.5 0 0 0 0-.708l-3.5-3.5a.5.5 0 0 0-.708 0"/>
                    </svg>
                </button>
                <!-- the student workspace from xl: split view (side by side) or full view (one at a time) -->
                <button
                    v-if="view"
                    class="toggle-btn d-none d-xl-inline-flex"
                    type="button"
                    :title="view === 'full' ? 'Split view: editor and preview side by side' : 'Full view: one at a time, with the whole width'"
                    data-testid="btn-toggle-view"
                    @click="emit('toggle-view')"
                >
                    <!-- svg like the other header buttons, so they line up -->
                    <svg v-if="view === 'full'" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-layout-split" viewBox="0 0 16 16">
                        <path d="M0 3a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2zm8.5-1v12H14a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1zm-1 0H2a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h5.5z"/>
                    </svg>
                    <svg v-else xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-arrows-angle-expand" viewBox="0 0 16 16">
                        <path fill-rule="evenodd" d="M5.828 10.172a.5.5 0 0 0-.707 0l-4.096 4.096V11.5a.5.5 0 0 0-1 0v3.975a.5.5 0 0 0 .5.5H4.5a.5.5 0 0 0 0-1H1.732l4.096-4.096a.5.5 0 0 0 0-.707m4.344-4.344a.5.5 0 0 0 .707 0l4.096-4.096V4.5a.5.5 0 1 0 1 0V.525a.5.5 0 0 0-.5-.5H11.5a.5.5 0 0 0 0 1h2.768l-4.096 4.096a.5.5 0 0 0 0 .707"/>
                    </svg>
                </button>
            </div>
        </div>

        <div class="pane-body">
            <!-- iframe is hidden while popped out so the app isn't running twice -->
            <iframe v-if="previewUrl && !poppedOut" ref="frame" :key="frameKey" :src="previewUrl"></iframe>

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
