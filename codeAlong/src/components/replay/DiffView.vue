<script setup>
// Shows the difference between two versions of a project's files, one panel per changed file.
// Used by "What you missed", the replay and the TA's side-by-side review.
//   <DiffView :before="myFiles" :after="checkpointFiles" before-label="Your code" after-label="Checkpoint" />
// mode 'split' is side by side from sm up and stacked on phones; 'unified' is always stacked.
import { computed, ref, watch } from 'vue'
import { diffSummary } from '@shared/diff-summary.js'
import EmptyState from '@/components/ui/EmptyState.vue'
import { splitRows } from './diffRows.js'

const props = defineProps({
  before: { type: Array, default: () => [] }, // [{ path, content }]
  after: { type: Array, default: () => [] },
  mode: { type: String, default: 'split' }, // 'split' or 'unified'
  beforeLabel: { type: String, default: 'Before' },
  afterLabel: { type: String, default: 'After' },
})

const files = computed(() => diffSummary(props.before, props.after).files)

// What happened to a file, in this view's words
const statusLabel = (file) =>
  ({
    modified: 'Changed',
    added: `Only in ${props.afterLabel}`,
    removed: `Only in ${props.beforeLabel}`,
  })[file.status]

// Unchanged lines stay hidden until asked for. Each block is a hunk with the gap above it, plus
// one for whatever follows the last hunk. New files to compare start with everything hidden again.
const shownGaps = ref(new Set())
watch(files, () => (shownGaps.value = new Set()))
const showGap = (key) => (shownGaps.value = new Set(shownGaps.value).add(key))
function blocks(file) {
  const block = (key, hidden, lines) =>
    shownGaps.value.has(key)
      ? { key, hiddenCount: 0, lines: [...hidden, ...lines] }
      : { key, hiddenCount: hidden.length, lines }
  return [
    ...file.hunks.map((h, i) => block(`${file.path}:${i}`, h.hiddenBefore, h.lines)),
    block(`${file.path}:end`, file.hiddenAfter, []),
  ].filter((b) => b.hiddenCount || b.lines.length)
}
const gapLabel = (n) => `Show ${n} unchanged ${n === 1 ? 'line' : 'lines'}`

// A + or − in front of each changed line, so the change shows without relying on colour
const MARK = { add: '+ ', del: '− ', context: '  ' }
const BG = { add: 'bg-success-subtle', del: 'bg-danger-subtle', context: '' }

// Side by side: the text and colour of one side of a row (grey when that side has no line)
const sideText = (line) => (line ? MARK[line.type] + line.text : '')
const sideBg = (line) => (line ? BG[line.type] : 'bg-body-secondary')
</script>

<template>
  <div class="d-grid gap-3" data-testid="diff-view">
    <div v-if="!files.length" class="ca-surface">
      <EmptyState icon="bi-check2-circle" title="No differences" compact>
        The code matches. Spacing and blank lines are ignored.
      </EmptyState>
    </div>

    <section v-for="file in files" :key="file.path" class="ca-surface overflow-hidden">
      <div
        class="d-flex flex-wrap align-items-center gap-2 px-3 py-2 bg-body-tertiary border-bottom small"
      >
        <span class="ca-mono fw-semibold text-break me-auto">{{ file.path }}</span>
        <span class="text-body-secondary">{{ statusLabel(file) }}</span>
        <span class="ca-mono fw-semibold text-success-emphasis">+{{ file.added }}</span>
        <span class="ca-mono fw-semibold text-danger-emphasis">−{{ file.removed }}</span>
      </div>
      <p v-if="file.status === 'modified'" class="px-3 py-1 mb-0 small text-body-secondary">
        First difference at line {{ file.firstDiffLine }}
      </p>
      <p v-if="!file.hunks.length" class="px-3 py-1 mb-0 small text-body-secondary">Empty file</p>

      <template v-else>
        <!-- Stacked: always when mode is 'unified', and on phones -->
        <div :class="{ 'd-sm-none': mode === 'split' }">
          <p class="px-3 py-1 mb-0 small">
            <span class="text-danger-emphasis me-3">− {{ beforeLabel }}</span>
            <span class="text-success-emphasis">+ {{ afterLabel }}</span>
          </p>
          <table class="diff-table w-100 ca-mono small">
            <colgroup>
              <col class="diff-num" />
              <col />
            </colgroup>
            <tbody v-for="b in blocks(file)" :key="b.key">
              <tr v-if="b.hiddenCount">
                <td colspan="2" class="p-0 bg-body-tertiary">
                  <button
                    type="button"
                    class="diff-gap btn btn-link btn-sm w-100 text-start text-decoration-none rounded-0 px-3"
                    data-testid="diff-show-gap"
                    @click="showGap(b.key)"
                  >
                    <i class="bi bi-arrows-expand me-1" />{{ gapLabel(b.hiddenCount) }}
                  </button>
                </td>
              </tr>
              <tr v-for="(line, i) in b.lines" :key="i" :class="BG[line.type]">
                <td class="px-2 text-end align-top text-body-secondary user-select-none">
                  {{ line.newLine ?? line.oldLine }}
                </td>
                <td class="diff-code px-2">{{ MARK[line.type] + line.text }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Side by side, from sm up -->
        <table v-if="mode === 'split'" class="diff-table w-100 ca-mono small d-none d-sm-table">
          <colgroup>
            <col class="diff-num" />
            <col />
            <col class="diff-num" />
            <col />
          </colgroup>
          <thead class="border-bottom text-body-secondary">
            <tr>
              <th colspan="2" class="px-3 py-1 fw-semibold">{{ beforeLabel }}</th>
              <th colspan="2" class="px-3 py-1 fw-semibold border-start">{{ afterLabel }}</th>
            </tr>
          </thead>
          <tbody v-for="b in blocks(file)" :key="b.key">
            <tr v-if="b.hiddenCount">
              <td colspan="4" class="p-0 bg-body-tertiary">
                <button
                  type="button"
                  class="diff-gap btn btn-link btn-sm w-100 text-start text-decoration-none rounded-0 px-3"
                  data-testid="diff-show-gap"
                  @click="showGap(b.key)"
                >
                  <i class="bi bi-arrows-expand me-1" />{{ gapLabel(b.hiddenCount) }}
                </button>
              </td>
            </tr>
            <tr v-for="(row, i) in splitRows(b.lines)" :key="i">
              <td
                class="px-2 text-end align-top text-body-secondary user-select-none"
                :class="sideBg(row.left)"
              >
                {{ row.left?.oldLine }}
              </td>
              <td class="diff-code px-2" :class="sideBg(row.left)">{{ sideText(row.left) }}</td>
              <td
                class="px-2 text-end align-top text-body-secondary user-select-none border-start"
                :class="sideBg(row.right)"
              >
                {{ row.right?.newLine }}
              </td>
              <td class="diff-code px-2" :class="sideBg(row.right)">{{ sideText(row.right) }}</td>
            </tr>
          </tbody>
        </table>
      </template>
    </section>
  </div>
</template>

<style scoped>
/* Fixed columns, and code that keeps its indentation but wraps, so nothing scrolls sideways */
.diff-table {
  table-layout: fixed;
}
.diff-num {
  width: 3rem;
}
.diff-code {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
