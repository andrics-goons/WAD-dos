<script setup>
// Shows the difference between two versions of a project's files, file by file.
// Used by "What you missed", the replay and the TA's side-by-side review.
//   <DiffView :before="myFiles" :after="checkpointFiles" before-label="Your code" after-label="Checkpoint" />
// Phones always get the stacked (unified) layout; side-by-side needs the width.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { diffSummary } from '@shared/diff-summary.js'
import EmptyState from '@/components/ui/EmptyState.vue'
import { splitRows } from './diffRows.js'

const props = defineProps({
  before: { type: Array, default: () => [] }, // [{ path, content }]
  after: { type: Array, default: () => [] },
  mode: { type: String, default: 'split', validator: (v) => ['split', 'unified'].includes(v) },
  beforeLabel: { type: String, default: 'Before' },
  afterLabel: { type: String, default: 'After' },
})

const summary = computed(() => diffSummary(props.before, props.after))

// Below Bootstrap's sm breakpoint, force the stacked layout. Checked straight away so a
// phone never flashes the side-by-side layout first, then kept up to date on resize/rotate.
const media = typeof window !== 'undefined' ? window.matchMedia?.('(max-width: 575.98px)') : null
const narrow = ref(media?.matches ?? false)
const onMediaChange = (e) => (narrow.value = e.matches)
onMounted(() => media?.addEventListener('change', onMediaChange))
onBeforeUnmount(() => media?.removeEventListener('change', onMediaChange))

const view = computed(() => (narrow.value ? 'unified' : props.mode))

// Header text and icon for each file, worded with this view's labels
const fileMeta = (file) =>
  ({
    modified: { label: 'Changed', icon: 'bi-pencil' },
    added: { label: `Only in ${props.afterLabel}`, icon: 'bi-file-earmark-plus' },
    removed: { label: `Only in ${props.beforeLabel}`, icon: 'bi-file-earmark-minus' },
  })[file.status]

// The line number shown above each hunk (a removed file only has "before" numbers)
const hunkStart = (file, hunk) => (file.status === 'removed' ? hunk.oldStart : hunk.newStart)

// Side-by-side: tint a side's number and code cells together; grey when that side has no line
const sideClass = (line) => (line ? `diff-cell--${line.type}` : 'diff-cell--empty')

const MARK = { add: '+', del: '−', context: '' }
const SR_LABEL = { add: 'Added: ', del: 'Removed: ', context: '' }
</script>

<template>
  <div class="diff-view" :data-mode="view" data-testid="diff-view">
    <div v-if="!summary.files.length" class="ca-surface">
      <EmptyState icon="bi-check2-circle" title="No differences" compact>
        The code matches. Spacing and blank lines are ignored.
      </EmptyState>
    </div>

    <section
      v-for="file in summary.files"
      :key="file.path"
      class="diff-file"
      :data-status="file.status"
      :data-testid="`diff-file-${file.path}`"
    >
      <!-- File header: name, what happened to it, line counts -->
      <header class="diff-file__header">
        <i class="bi" :class="fileMeta(file).icon" aria-hidden="true" />
        <!-- <wbr> after each "/" lets a long path break between folders, not mid-name -->
        <span class="ca-mono diff-file__path"
          ><template v-for="(part, i) in file.path.split('/')" :key="i"
            ><template v-if="i">/<wbr /></template>{{ part }}</template
          ></span
        >
        <span class="diff-file__status">{{ fileMeta(file).label }}</span>
        <span class="diff-count diff-count--add" :aria-label="`${file.added} lines added`">
          +{{ file.added }}
        </span>
        <span class="diff-count diff-count--del" :aria-label="`${file.removed} lines removed`">
          −{{ file.removed }}
        </span>
      </header>
      <p v-if="file.status === 'modified'" class="diff-file__hint" data-testid="diff-first-line">
        First difference at line {{ file.firstDiffLine }}
      </p>

      <p v-if="!file.hunks.length" class="diff-file__hint">Empty file</p>

      <!-- Stacked: one column, removed lines then added lines -->
      <template v-else-if="view === 'unified'">
        <p class="diff-legend">
          <span class="diff-count diff-count--del">− {{ beforeLabel }}</span>
          <span class="diff-count diff-count--add">+ {{ afterLabel }}</span>
        </p>
        <table class="diff-table ca-mono">
          <colgroup>
            <col class="diff-col-num" />
            <col class="diff-col-num" />
            <col class="diff-col-mark" />
            <col />
          </colgroup>
          <tbody v-for="(hunk, h) in file.hunks" :key="h">
            <tr v-if="hunkStart(file, hunk) > 1" class="diff-gap">
              <td colspan="4">⋯ line {{ hunkStart(file, hunk) }}</td>
            </tr>
            <tr
              v-for="(line, i) in hunk.lines"
              :key="i"
              :class="`diff-row--${line.type}`"
              :data-type="line.type"
              data-testid="diff-row"
            >
              <td class="diff-num">{{ line.oldLine }}</td>
              <td class="diff-num">{{ line.newLine }}</td>
              <td class="diff-mark" aria-hidden="true">{{ MARK[line.type] }}</td>
              <td class="diff-code">
                <span class="visually-hidden">{{ SR_LABEL[line.type] }}</span
                >{{ line.text }}
              </td>
            </tr>
          </tbody>
        </table>
      </template>

      <!-- Side by side: before on the left, after on the right -->
      <table v-else class="diff-table diff-table--split ca-mono">
        <colgroup>
          <col class="diff-col-num" />
          <col />
          <col class="diff-col-num" />
          <col />
        </colgroup>
        <thead>
          <tr>
            <th colspan="2" scope="col">{{ beforeLabel }}</th>
            <th colspan="2" scope="col">{{ afterLabel }}</th>
          </tr>
        </thead>
        <tbody v-for="(hunk, h) in file.hunks" :key="h">
          <tr v-if="hunkStart(file, hunk) > 1" class="diff-gap">
            <td colspan="4">⋯ line {{ hunkStart(file, hunk) }}</td>
          </tr>
          <tr v-for="(row, i) in splitRows(hunk.lines)" :key="i" data-testid="diff-row">
            <td class="diff-num" :class="sideClass(row.left)">{{ row.left?.oldLine }}</td>
            <td class="diff-code" :class="sideClass(row.left)" :data-type="row.left?.type">
              <template v-if="row.left">
                <span class="visually-hidden">{{ SR_LABEL[row.left.type] }}</span
                >{{ row.left.text }}
              </template>
            </td>
            <td class="diff-num" :class="sideClass(row.right)">{{ row.right?.newLine }}</td>
            <td class="diff-code" :class="sideClass(row.right)" :data-type="row.right?.type">
              <template v-if="row.right">
                <span class="visually-hidden">{{ SR_LABEL[row.right.type] }}</span
                >{{ row.right.text }}
              </template>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>

<style scoped>
.diff-view {
  display: grid;
  gap: var(--ca-space-4);
}

/* One bordered panel per file */
.diff-file {
  border: 1px solid var(--ca-border);
  border-radius: var(--ca-radius);
  background: var(--ca-surface);
  overflow: hidden;
}
.diff-file__header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ca-space-1) var(--ca-space-2);
  padding: var(--ca-space-2) var(--ca-space-3);
  background: var(--ca-surface-muted);
  border-bottom: 1px solid var(--ca-border);
  font-size: var(--ca-text-sm);
}
/* Wraps rather than truncates: on a phone the file name at the end is the part that matters */
.diff-file__path {
  flex: 1 1 10rem;
  min-width: 0;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.diff-file__status {
  color: var(--ca-text-muted);
}
.diff-file__hint,
.diff-legend {
  display: flex;
  gap: var(--ca-space-3);
  margin: 0;
  padding: var(--ca-space-1) var(--ca-space-3);
  font-size: var(--ca-text-xs);
  color: var(--ca-text-muted);
}

/* +3 / −1 counts: green and red text, readable on light and dark backgrounds */
.diff-count {
  font-family: var(--ca-font-mono);
  font-weight: 600;
}
.diff-count--add {
  color: var(--ca-state-done-fg);
}
.diff-count--del {
  color: var(--ca-state-error-fg);
}

/* The code itself. Long lines wrap, so the page never scrolls sideways at 375 px. */
.diff-table {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  font-size: var(--ca-text-xs);
  line-height: 1.6;
}
.diff-col-num {
  width: 2.75rem;
}
.diff-col-mark {
  width: 1.25rem;
}
.diff-table th {
  padding: var(--ca-space-1) var(--ca-space-3);
  border-bottom: 1px solid var(--ca-border);
  font-family: var(--ca-font-sans);
  font-weight: 600;
  color: var(--ca-text-muted);
}
.diff-table--split th + th,
.diff-table--split td:nth-child(3) {
  border-left: 1px solid var(--ca-border);
}
.diff-num {
  padding: 0 var(--ca-space-2);
  text-align: right;
  vertical-align: top;
  color: var(--ca-text-muted);
  user-select: none;
}
.diff-mark {
  vertical-align: top;
  text-align: center;
  user-select: none;
}
.diff-code {
  padding: 0 var(--ca-space-2);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  vertical-align: top;
}

/* Added = green tint, removed = red tint; the +/− mark and screen-reader text say it too */
.diff-row--add td,
.diff-cell--add {
  background: var(--ca-state-done-bg);
}
.diff-row--del td,
.diff-cell--del {
  background: var(--ca-state-error-bg);
}
.diff-row--add .diff-mark {
  color: var(--ca-state-done-fg);
}
.diff-row--del .diff-mark {
  color: var(--ca-state-error-fg);
}
.diff-cell--empty {
  background: var(--ca-surface-muted);
}

/* "⋯ line 22" between hunks: unchanged lines hidden here */
.diff-gap td {
  padding: var(--ca-space-1) var(--ca-space-3);
  background: var(--ca-brand-subtle);
  color: var(--ca-text-muted);
  font-family: var(--ca-font-sans);
}

@media (min-width: 768px) {
  .diff-table {
    font-size: var(--ca-text-sm);
  }
  .diff-col-num {
    width: 3.25rem;
  }
}
</style>
