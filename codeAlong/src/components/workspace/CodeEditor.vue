<script setup>
    import { ref, watch, onMounted, onBeforeUnmount } from "vue"
    import { EditorView, basicSetup } from 'codemirror'
    // Importing linters and syntaxTrees for error detection
    import { linter, lintGutter } from "@codemirror/lint"
    import { syntaxTree } from "@codemirror/language"
    // Importing utils to help with identifying language
    import { languageFor } from "@/utils/languages.js"
    // Importing Compartment from codemirror to help change language of codemirror on the fly
    import { Compartment } from "@codemirror/state"
    // Dark theme
    import { oneDark } from "@codemirror/theme-one-dark"
    // Allow tab in the codemirror
    import { keymap } from "@codemirror/view"
    import { indentWithTab } from "@codemirror/commands"

    // Defining props so that code can be passed down
    const props = defineProps({
        selectedFile: { type: String, default: "" },
        selectedCode: { type: String, default: "" },
    })

    // Defining emits to allow updating of file inputted
    const emit = defineEmits(["update:selectedCode"])

    // Creating editor Element
    const editorEl = ref(null)
    let view

    // Creating synatxError tree
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

    // 
    const language = new Compartment()

    // using watch() to react to changes in prop value to reconfigure the language
    watch(() => props.selectedFile, () => {
            view.dispatch({ effects: language.reconfigure(languageFor(props.selectedFile)) })
        }
    )

    // On mounted, create new codeEditor view
    onMounted(() => {
        view = new EditorView({
            doc: props.selectedCode,
            extensions: [
            basicSetup,
            keymap.of([indentWithTab]),
            language.of(languageFor(props.selectedFile)),
            syntaxErrors,
            lintGutter(),
            oneDark,
            EditorView.updateListener.of((update) => {
                if (update.docChanged) {
                    emit("update:selectedCode", update.state.doc.toString())
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