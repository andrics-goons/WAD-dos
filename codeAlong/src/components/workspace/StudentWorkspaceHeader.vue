<script setup>
    // The lesson, the prof's latest checkpoint, and Done for it: one button that says "I'm caught
    // up", and goes back to In progress when clicked again. A new checkpoint puts everyone back to
    // In progress. "Load latest
    // checkpoint" asks the page to replace my code with it (the page confirms first).
    import HelpButton from "@/components/help/HelpButton.vue"

    defineProps({
        lessonTitle: { type: String, default: "" },
        checkpoint: { type: String, default: "" },    // "Checkpoint 3 · Added ItemCard", or "Starter code"
        done: { type: Boolean, default: false },      // I've clicked Done on that checkpoint
        disabled: { type: Boolean, default: false },  // still loading, or the class has ended
        canLoadCheckpoint: { type: Boolean, default: false }, // there is one, and the prof allows catching up
        slowDown: { type: Boolean, default: false },  // I've asked the prof to slow down
        sessionId: { type: [String, Number], default: null },
        files: { type: Array, default: () => [] },
    })

    // done: I'm caught up to the checkpoint · undo: back to In progress · load-checkpoint: catch up
    // slow-down: ask the prof to slow down, or take it back (anonymous: they only see a count)
    const emit = defineEmits(["done", "undo", "load-checkpoint", "slow-down"])
</script>

<template>
    <header class="workspace-header">
        <div class="header-title">
            <div class="course-name text-truncate" data-testid="workspace-checkpoint">{{ checkpoint }}</div>
            <h1 class="text-truncate">{{ lessonTitle || "Class workspace" }}</h1>
        </div>

        <!-- below lg the buttons show only their icon (Load keeps a short label); the visually-hidden span keeps its name -->
        <div class="header-actions">
            <!-- Done: I'm caught up to the checkpoint. Green once clicked; clicking again goes
                 back to In progress -->
            <button
                type="button"
                class="ca-btn"
                :class="done ? 'btn-done-on' : 'ca-btn--secondary'"
                :disabled="disabled"
                :title="done ? 'You\'re marked Done. Click to go back to In progress' : 'Tell the prof you\'ve caught up to this checkpoint'"
                data-testid="btn-done"
                @click="emit(done ? 'undo' : 'done')"
            >
                <i class="bi" :class="done ? 'bi-check-circle-fill' : 'bi-check-circle'" />
                <!-- both labels share one cell, so the button stays as wide as "Mark done" -->
                <span class="done-label d-none d-lg-inline-grid">
                    <span :class="{ invisible: done }">Mark done</span>
                    <span :class="{ invisible: !done }">Done</span>
                </span>
                <span class="visually-hidden d-lg-none">{{ done ? "Done" : "Mark done" }}</span>
            </button>

            <button
                type="button"
                class="ca-btn"
                :class="slowDown ? 'btn-slow-on' : 'ca-btn--secondary'"
                :disabled="disabled"
                :title="slowDown ? 'You asked the prof to slow down. Click to take it back' : 'Ask the prof to slow down (anonymous)'"
                data-testid="btn-slow-down"
                @click="emit('slow-down')"
            >
                <i class="bi bi-speedometer2" />
                <!-- asked: the button turns soft orange, the label stays -->
                <span class="d-none d-lg-inline">Slow down</span>
                <span class="visually-hidden d-lg-none">Slow down</span>
            </button>

            <button
                type="button"
                class="ca-btn ca-btn--secondary"
                :disabled="disabled || !canLoadCheckpoint"
                data-testid="btn-load-checkpoint"
                @click="emit('load-checkpoint')"
            >
                <i class="bi bi-arrow-counterclockwise" />
                <span class="d-none d-lg-inline">Load checkpoint</span>
                <span class="d-lg-none">Load</span>
            </button>
            <HelpButton v-if="sessionId" :session-id="sessionId" :files="files" />
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
    .done-label > span {
        grid-area: 1 / 1;
    }

    /* Done and Slow down when on: the soft state colours the dashboard's badges use (with their
       dark-mode versions), a border in the full colour and a gentle glow of it */
    .btn-done-on {
        --btn-bg: var(--ca-state-done-bg);
        --btn-bg-hover: var(--ca-state-done-bg);
        --btn-fg: var(--ca-state-done-fg);
        --btn-border: var(--ca-state-done);
        box-shadow: 0 0 10px color-mix(in srgb, var(--ca-state-done) 35%, transparent);
    }
    .btn-slow-on {
        --btn-bg: var(--ca-state-in_progress-bg);
        --btn-bg-hover: var(--ca-state-in_progress-bg);
        --btn-fg: var(--ca-state-in_progress-fg);
        --btn-border: var(--ca-state-in_progress);
        box-shadow: 0 0 10px color-mix(in srgb, var(--ca-state-in_progress) 35%, transparent);
    }
    .btn-done-on .bi {
        color: var(--ca-state-done);
    }
    .btn-slow-on .bi {
        color: var(--ca-state-in_progress);
    }
</style>
