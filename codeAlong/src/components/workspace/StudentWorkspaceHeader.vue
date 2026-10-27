<script setup>
    // The lesson, the step the prof is on, and "My status" for that step. Load latest checkpoint
    // and Help don't do anything yet.
    defineProps({
        lessonTitle: { type: String, default: "" },
        step: { type: Object, default: null },        // the prof's current step { order, title }
        stepCount: { type: Number, default: 0 },
        done: { type: Boolean, default: false },      // I've marked this step Completed
        disabled: { type: Boolean, default: false },  // still loading, or the class has ended
        sessionId: { type: [String, Number], default: null },
        stepId: { type: [String, Number], default: null },
        files: { type: Array, default: () => [] },
    })

    // done: mark the current step Completed · undo: back to In progress
    const emit = defineEmits(["done", "undo"])
</script>

<template>
    <header class="workspace-header">
        <div class="header-title">
            <div class="course-name text-truncate" data-testid="workspace-step-current">
                <template v-if="step">Step {{ step.order }} of {{ stepCount }} · {{ step.title }}</template>
            </div>
            <h1 class="text-truncate">{{ lessonTitle || "Class workspace" }}</h1>
        </div>

        <!-- below lg the buttons show only their icon (Load keeps a short label); the visually-hidden span keeps its name -->
        <div class="header-actions">
            <!-- My status: the active class marks the selected option -->
            <div class="status-group">
                <span class="status-label d-none d-lg-inline">My status</span>
                <div class="status-toggle">
                    <button
                        type="button"
                        class="status-option status-option--in-progress"
                        :class="{ active: !done }"
                        :disabled="disabled"
                        @click="done && emit('undo')"
                    >
                        <i class="bi bi-clock" />
                        <span class="d-none d-lg-inline">In progress</span>
                        <span class="visually-hidden d-lg-none">In progress</span>
                    </button>
                    <button
                        type="button"
                        class="status-option status-option--done"
                        :class="{ active: done }"
                        :disabled="disabled"
                        data-testid="btn-done"
                        @click="!done && emit('done')"
                    >
                        <i class="bi bi-check-circle" />
                        <span class="d-none d-lg-inline">Completed</span>
                        <span class="visually-hidden d-lg-none">Completed</span>
                    </button>
                </div>
            </div>

            <div class="divider d-none d-lg-block" />

            <button type="button" class="ca-btn ca-btn--secondary">
                <i class="bi bi-arrow-counterclockwise" />
                <span class="d-none d-lg-inline">Load latest checkpoint</span>
                <span class="d-lg-none">Load</span>
            </button>
            <HelpButton v-if="stepId" :session-id="sessionId" :step-id="stepId" :files="files" />
        </div>
    </header>
</template>

<style scoped>
    /* title left, icon buttons right on one row; from lg the full buttons wrap onto a second line if they must */
    .workspace-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--ca-space-3) var(--ca-space-4);
        padding: var(--ca-space-3) 0;
    }
    /* min-width: 0 lets the title shrink and truncate instead of pushing the buttons off screen */
    .header-title {
        min-width: 0;
    }
    .course-name {
        font-size: var(--ca-text-xs);
        color: var(--ca-text-muted);
    }
    h1 {
        margin: 0;
        font-size: var(--ca-text-lg);
        font-weight: 700;
        line-height: 1.2;
    }
    .header-actions {
        display: flex;
        flex-shrink: 0;
        align-items: center;
        gap: var(--ca-space-2);
    }
    @media (min-width: 992px) {
        .workspace-header {
            flex-wrap: wrap;
        }
        h1 {
            font-size: var(--ca-text-xl);
        }
        .header-actions {
            gap: var(--ca-space-3);
        }
    }

    /* ── My status toggle ── */
    .status-group {
        display: flex;
        align-items: center;
        gap: var(--ca-space-3);
    }
    .status-label {
        font-size: var(--ca-text-sm);
        font-weight: 500;
    }
    /* grey track the two options sit in */
    .status-toggle {
        display: inline-flex;
        gap: var(--ca-space-1);
        padding: var(--ca-space-1);
        background: var(--ca-surface-muted);
        border-radius: var(--ca-radius-lg);
    }
    .status-option {
        display: inline-flex;
        align-items: center;
        gap: var(--ca-space-2);
        min-height: 2.5rem;
        padding: 0 var(--ca-space-3);
        border: 1px solid transparent;
        border-radius: var(--ca-radius);
        background: transparent;
        color: var(--ca-text-muted);
        font-size: var(--ca-text-sm);
        font-weight: 600;
        white-space: nowrap;
        cursor: pointer;
        transition:
            background-color 0.15s ease,
            border-color 0.15s ease,
            color 0.15s ease;
    }
    @media (min-width: 992px) {
        .status-option {
            padding: 0 var(--ca-space-4);
        }
    }
    .status-option:hover {
        color: var(--ca-text);
    }
    .status-option:focus-visible {
        outline: none;
        box-shadow: 0 0 0 3px var(--ca-brand-ring);
    }
    /* selected option takes its tile-state colours, so it matches the teacher's dashboard */
    .status-option--in-progress.active {
        background: var(--ca-state-in_progress-bg);
        border-color: var(--ca-warning);
        color: var(--ca-state-in_progress-fg);
    }
    .status-option--in-progress.active .bi {
        color: var(--ca-state-in_progress);
    }
    .status-option--done.active {
        background: var(--ca-state-done-bg);
        border-color: var(--ca-state-done);
        color: var(--ca-state-done-fg);
    }
    .status-option--done.active .bi {
        color: var(--ca-state-done);
    }

    .divider {
        width: 1px;
        height: 2rem;
        margin: 0 var(--ca-space-1);
        background: var(--ca-border);
    }
</style>
