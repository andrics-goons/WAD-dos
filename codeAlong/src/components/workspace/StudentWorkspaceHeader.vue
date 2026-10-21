<script setup>
    // Styling only for now: course name and title are hard-coded, and the status
    // toggle + buttons don't do anything yet. TODO FUTURE: pass these in from the lesson.
</script>

<template>
    <header class="workspace-header">
        <div>
            <div class="course-name">IS216 Web Application Development II</div>
            <h1>Class workspace</h1>
        </div>

        <div class="header-actions">
            <!-- My status: aria-pressed="true" marks the selected option -->
            <div class="status-group">
                <span class="status-label">My status</span>
                <div class="status-toggle" role="group" aria-label="My status">
                    <button type="button" class="status-option status-option--in-progress" aria-pressed="true">
                        <i class="bi bi-clock" aria-hidden="true" />In progress
                    </button>
                    <button type="button" class="status-option status-option--done" aria-pressed="false">
                        <i class="bi bi-check-circle" aria-hidden="true" />Completed
                    </button>
                </div>
            </div>

            <!-- hidden below md, where the actions wrap onto their own line -->
            <div class="divider d-none d-md-block" aria-hidden="true" />

            <button type="button" class="ca-btn ca-btn--secondary">
                <i class="bi bi-arrow-counterclockwise" aria-hidden="true" />Load latest checkpoint
            </button>
            <button type="button" class="ca-btn ca-btn--secondary">
                <i class="bi bi-question-circle" aria-hidden="true" />Help
            </button>
        </div>
    </header>
</template>

<style scoped>
    /* title left, actions right; wraps onto two lines on narrow screens */
    .workspace-header {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: var(--ca-space-3) var(--ca-space-4);
        padding: var(--ca-space-3) 0;
    }
    .course-name {
        font-size: var(--ca-text-xs);
        color: var(--ca-text-muted);
    }
    h1 {
        margin: 0;
        font-size: var(--ca-text-xl);
        font-weight: 700;
        line-height: 1.2;
    }
    .header-actions {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--ca-space-3);
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
        padding: 0 var(--ca-space-4);
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
    .status-option:hover {
        color: var(--ca-text);
    }
    .status-option:focus-visible {
        outline: none;
        box-shadow: 0 0 0 3px var(--ca-brand-ring);
    }
    /* selected option takes its tile-state colours, so it matches the teacher's dashboard */
    .status-option--in-progress[aria-pressed='true'] {
        background: var(--ca-state-in_progress-bg);
        border-color: var(--ca-warning);
        color: var(--ca-state-in_progress-fg);
    }
    .status-option--in-progress[aria-pressed='true'] .bi {
        color: var(--ca-state-in_progress);
    }
    .status-option--done[aria-pressed='true'] {
        background: var(--ca-state-done-bg);
        border-color: var(--ca-state-done);
        color: var(--ca-state-done-fg);
    }
    .status-option--done[aria-pressed='true'] .bi {
        color: var(--ca-state-done);
    }

    .divider {
        width: 1px;
        height: 2rem;
        margin: 0 var(--ca-space-1);
        background: var(--ca-border);
    }
</style>
