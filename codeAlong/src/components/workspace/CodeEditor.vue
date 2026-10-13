<script setup>
    import { ref, onMounted, onBeforeUnmount } from "vue"
    import { EditorView, basicSetup } from 'codemirror'
    import { javascript } from '@codemirror/lang-javascript'
    import { linter, lintGutter } from "@codemirror/lint"
    import { syntaxTree } from "@codemirror/language"
    import {oneDark} from "@codemirror/theme-one-dark"

    const props = defineProps({
        modelValue: {type: String, default: "" }
    })

    const emit = defineEmits(["update:modelValue"])

    const editorEl = ref(null)
    let view

    const syntaxErrors = linter((view) => {
        const errors = []
        syntaxTree(view.state).cursor().iterate((node) => {
            if (node.type.isError) {
            errors.push({
                from: node.from,
                to: Math.max(node.to, node.from + 1),  // at least 1 character so it's visible
                severity: "error",
                message: "Syntax error",
            })
            }
        })
        return errors
    })

    onMounted(() => {
    view = new EditorView({
        doc: props.modelValue,
        extensions: [
        basicSetup,
        javascript(),
        syntaxErrors,
        lintGutter(),
        oneDark,
        EditorView.updateListener.of((update) => {
            if (update.docChanged) {
            emit("update:modelValue", update.state.doc.toString())
            }
        }),
        ],
        parent: editorEl.value,
    })
    })

    onBeforeUnmount(() => view.destroy())
</script>

<template>
    <div ref="editorEl" class="editor"></div>
</template>

<style scoped>
    .editor {
        height: 100%;
    }
    .editor :deep(.cm-editor) {
        height: 100%;
    }
    .editor :deep(.cm-scroller) {
        overflow: auto;
    }
</style>