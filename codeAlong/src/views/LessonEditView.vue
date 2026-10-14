<script setup>
// Layout only. File editor on the left, step list on the right.
// xs: the editor becomes an offcanvas sheet (Bootstrap's responsive offcanvas-lg); lg+: inline.
import { ref } from 'vue'
import StepList from '@/components/lesson/StepList.vue'
import { steps } from '@/mock/profMock'

defineProps({ id: { type: String, required: true } })

const planSteps = steps.map((s) => ({ ...s, status: 'todo' }))
const activeFile = ref('src/App.vue')
const files = ['index.html', 'package.json', 'server/api.js', 'src/App.vue', 'src/ItemCard.vue', 'src/main.js']
</script>

<template>
  <div class="container-fluid py-3">
    <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
      <div class="me-auto">
        <h1 class="h4 mb-0">Edit lesson</h1>
        <small class="text-secondary">Week 6 · Mini Cart (draft)</small>
      </div>
      <button type="button" class="btn btn-outline-secondary btn-sm d-lg-none" data-bs-toggle="offcanvas" data-bs-target="#editor-sheet">
        Open file editor
      </button>
      <button type="button" class="btn btn-outline-secondary btn-sm">Re-parse TODOs</button>
      <button type="button" class="btn btn-outline-danger btn-sm">Delete lesson</button>
      <button type="button" class="btn btn-primary btn-sm">Save</button>
    </div>

    <div class="row g-3">
      <!-- File editor -->
      <div class="col-lg-7">
        <div id="editor-sheet" class="offcanvas-lg offcanvas-bottom h-100" tabindex="-1">
          <div class="offcanvas-header d-lg-none">
            <h5 class="offcanvas-title">Starter files</h5>
            <button type="button" class="btn-close" data-bs-dismiss="offcanvas" data-bs-target="#editor-sheet" aria-label="Close" />
          </div>
          <div class="offcanvas-body">
            <div class="card w-100">
              <div class="card-header d-none d-lg-block">Starter files</div>
              <div class="row g-0">
                <div class="col-4 col-md-3 border-end">
                  <div class="list-group list-group-flush">
                    <button
                      v-for="f in files"
                      :key="f"
                      type="button"
                      class="list-group-item list-group-item-action font-monospace small"
                      :class="{ active: f === activeFile }"
                      @click="activeFile = f"
                    >
                      {{ f }}
                    </button>
                  </div>
                </div>
                <div class="col-8 col-md-9">
                  <pre class="card-body mb-0 small" style="min-height: 320px"><code class="d-block">&lt;script setup&gt;</code><code class="d-block">import axios from "axios"</code><code class="d-block"></code><code class="d-block">// TODO 4: handle the add-to-cart event</code><code class="d-block">function onAdd(item) {}</code><code class="d-block">&lt;/script&gt;</code></pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Step list -->
      <div class="col-lg-5">
        <div class="card">
          <div class="card-header d-flex justify-content-between align-items-center">
            <span>Steps · {{ planSteps.length }}</span>
            <button type="button" class="btn btn-sm btn-outline-secondary">+ Add step</button>
          </div>
          <StepList :steps="planSteps" editable />
        </div>
        <p class="small text-secondary mt-2">
          Steps come from <code>// TODO</code> comments. Drag (desktop) or use ↑ ↓ (phone) to reorder.
        </p>
      </div>
    </div>
  </div>
</template>
