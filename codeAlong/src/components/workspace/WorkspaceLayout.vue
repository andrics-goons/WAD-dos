<script setup>
    import { computed, ref } from "vue"

    // The editor and the preview side by side, shared by the student workspace and the TA's copy
    // of a student's code (/help/:id/code). From xl it's split view (side by side) or full view
    // (one at a time), picked with the expand / split button in either pane's header and kept on
    // this device. Below xl, and in full view, one shows at a time and the code / eye button in
    // each header swaps them. Nothing is unmounted, so the terminal and the running preview
    // survive every change.
    //
    // Each slot gets what its panel needs: <EditorPanel v-bind="pane" @toggle-view="toggleView"
    // @show-preview="swap" /> (switchable and view are EditorPanel's and PreviewPanel's props)

    // when one pane shows at a time (below xl, or in full view): is it the preview?
    const showPreview = ref(false)
    const VIEW_KEY = "codealong:workspace-view"
    const fullView = ref((() => {
        try {
            return localStorage.getItem(VIEW_KEY) === "full"
        } catch {
            return false
        }
    })())
    // from the editor's or the preview's button: going full, that pane is the one that stays
    function toggleView(preview) {
        fullView.value = !fullView.value
        if (fullView.value) showPreview.value = preview
        try {
            localStorage.setItem(VIEW_KEY, fullView.value ? "full" : "split")
        } catch {
            // private window or blocked storage: it just isn't remembered
        }
    }

    // full view shows the swap button at every size, and the view button which way it goes
    const pane = computed(() => ({ switchable: fullView.value, view: fullView.value ? "full" : "split" }))
    // the hidden pane: gone below xl (d-none); from xl, in full view, it folds away (pane-hidden),
    // so going full or swapping panes eases instead of snapping
    const hiddenPane = computed(() => ["d-none d-xl-block", { "pane-hidden": fullView.value }])
</script>

<template>
    <div class="workspace-layout">
        <div class="workspace-box" :class="showPreview && hiddenPane">
            <slot name="editor" :pane="pane" :toggle-view="() => toggleView(false)" :swap="() => (showPreview = true)" />
        </div>
        <div class="preview-box" :class="!showPreview && hiddenPane">
            <slot name="preview" :pane="pane" :toggle-view="() => toggleView(true)" :swap="() => (showPreview = false)" />
        </div>
    </div>
</template>

<style scoped>
    /* fills whatever height is left under the page's heading */
    .workspace-layout {
        display: flex;
        gap: var(--ca-space-3);
        flex: 1;
        min-height: 0;
    }
    /* Full view from xl: like the Teach view's Present, the other pane narrows to nothing and
       fades while this one widens, instead of snapping */
    .workspace-box,
    .preview-box {
        flex: 1 1 0;
        min-width: 0;
        transition:
            flex-grow 0.3s ease,
            opacity 0.3s ease,
            margin 0.3s ease,
            visibility 0s;
    }
    .pane-hidden {
        flex-grow: 0;
        opacity: 0;
        visibility: hidden;
        transition:
            flex-grow 0.3s ease,
            opacity 0.3s ease,
            margin 0.3s ease,
            visibility 0s 0.3s;
    }
    /* cancel the gap beside the folded pane, so it doesn't leave a strip behind */
    .workspace-box.pane-hidden {
        margin-right: calc(-1 * var(--ca-space-3));
    }
    .preview-box.pane-hidden {
        margin-left: calc(-1 * var(--ca-space-3));
    }
    /* overflow: hidden clips the editor panel's square corners to the rounded border, and while
       a pane narrows, keeps its contents from spilling over the other one */
    .workspace-box {
        border-radius: var(--ca-radius);
        overflow: hidden;
    }
    .preview-box {
        overflow: hidden;
    }
    @media (prefers-reduced-motion: reduce) {
        .workspace-box,
        .preview-box,
        .pane-hidden {
            transition: none;
        }
    }
</style>
