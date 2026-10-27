<script setup>
    // "Load latest checkpoint" asks first (design-docs/05 §7): loading replaces the student's
    // code with the prof's, and nothing keeps the old code, so they can download it first.
    import ConfirmModal from "@/components/ui/ConfirmModal.vue"
    import { checkpointLabel } from "@shared/checkpoint-label.js"

    defineProps({
        open: { type: Boolean, default: false },
        checkpoint: { type: Object, default: null }, // the prof's latest { seq, title }
        busy: { type: Boolean, default: false },     // loading it now
    })

    // download: save my project as a .zip · confirm: replace my code
    const emit = defineEmits(["update:open", "download", "confirm"])
</script>

<template>
    <ConfirmModal
        :open="open"
        title="Load the prof's latest checkpoint?"
        confirm-label="Replace my code"
        variant="danger"
        :busy="busy"
        @update:open="emit('update:open', $event)"
        @confirm="emit('confirm')"
    >
        <p>
            Your code will be replaced with
            <strong>{{ checkpoint && checkpointLabel(checkpoint.seq, checkpoint.title) }}</strong>.
            Anything you haven't downloaded will be lost.
        </p>
        <button
            type="button"
            class="ca-btn ca-btn--secondary"
            :disabled="busy"
            data-testid="btn-download-project"
            @click="emit('download')"
        >
            <i class="bi bi-download" />Download my project (.zip)
        </button>
    </ConfirmModal>
</template>
