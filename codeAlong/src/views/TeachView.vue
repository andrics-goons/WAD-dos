<script setup>
// Layout only: hard-coded data from @/mock/profMock. No store or API calls.
// No navbar here: the global nav (AppNavbar) wraps every page from App.vue.
import { computed, ref } from 'vue'
import ClassSummaryBar from '@/components/dashboard/ClassSummaryBar.vue'
import TileGrid from '@/components/dashboard/TileGrid.vue'
import ErrorGroupList from '@/components/dashboard/ErrorGroupList.vue'
import StepList from '@/components/lesson/StepList.vue'
import JoinCodeCard from '@/components/session/JoinCodeCard.vue'
import { lesson, steps, students, errorGroups, lostCount } from '@/mock/profMock'

defineProps({ id: { type: String, required: true } })

// xs: dashboard-first with the editor behind a tab. xl: everything visible at once.
const mobileTab = ref('dashboard')
const filter = ref('all')
const announcement = ref('')

const counts = computed(() =>
  students.reduce((acc, s) => ({ ...acc, [s.state]: (acc[s.state] ?? 0) + 1 }), {}),
)

const codeLines = [
  'import axios from "axios"',
  'import { ref } from "vue"',
  '',
  'const items = ref([])',
  'const cart = ref([])',
  '',
  '// TODO 4: handle the add-to-cart event',
  'function onAdd(item) {',
  '  // push item into cart',
  '}',
]
</script>

<template>
  <div class="container-fluid py-3">
    <!-- Session bar -->
    <div class="card mb-3">
      <div class="card-body d-flex flex-wrap align-items-center gap-2">
        <div class="me-auto">
          <strong>{{ lesson.title }}</strong>
          <div class="small text-secondary">{{ lesson.course }}</div>
        </div>
        <span class="badge text-bg-success">● LIVE</span>
        <small class="text-secondary">24 joined · 00:42:10</small>
        <form class="d-flex gap-1" @submit.prevent>
          <input
            v-model="announcement"
            type="text"
            class="form-control form-control-sm"
            maxlength="200"
            placeholder="Announce to class…"
            aria-label="Announcement"
          />
          <small class="text-secondary align-self-center">{{ announcement.length }}/200</small>
          <button class="btn btn-sm btn-outline-secondary" type="submit">Send</button>
        </form>
        <button type="button" class="btn btn-sm btn-outline-danger">End session</button>
      </div>
    </div>

    <!-- xs only: switch between dashboard and editor -->
    <ul class="nav nav-pills mb-3 d-xl-none">
      <li class="nav-item">
        <button type="button" class="nav-link" :class="{ active: mobileTab === 'dashboard' }" @click="mobileTab = 'dashboard'">Dashboard</button>
      </li>
      <li class="nav-item">
        <button type="button" class="nav-link" :class="{ active: mobileTab === 'editor' }" @click="mobileTab = 'editor'">Editor &amp; plan</button>
      </li>
    </ul>

    <div class="row g-3">
      <!-- Editor + preview + terminal -->
      <div class="col-xl-8" :class="{ 'd-none d-xl-block': mobileTab !== 'editor' }">
        <div class="card mb-3">
          <div class="card-header">
            <ul class="nav nav-tabs card-header-tabs">
              <li class="nav-item"><span class="nav-link active">App.vue</span></li>
              <li class="nav-item"><span class="nav-link">ItemCard.vue</span></li>
              <li class="nav-item"><span class="nav-link">main.js</span></li>
            </ul>
          </div>
          <pre class="card-body mb-0 small"><code v-for="(line, i) in codeLines" :key="i" class="d-block"><span class="text-secondary me-3 user-select-none">{{ i + 1 }}</span>{{ line }}</code></pre>
        </div>

        <div class="row g-3">
          <div class="col-md-7">
            <div class="card h-100">
              <div class="card-header">Live preview</div>
              <div class="card-body text-center text-secondary" style="min-height: 140px">Preview (WebContainer iframe)</div>
            </div>
          </div>
          <div class="col-md-5">
            <div class="card h-100">
              <div class="card-header">Terminal</div>
              <pre class="card-body mb-0 small" style="min-height: 140px">$ pnpm dev
  VITE ready in 612 ms
  ➜  Local: http://localhost:5173/</pre>
            </div>
          </div>
        </div>
      </div>

      <!-- Join code + plan + error groups -->
      <div class="col-xl-4" :class="{ 'd-none d-xl-block': mobileTab !== 'editor' }">
        <div class="d-flex flex-column gap-3">
          <JoinCodeCard :code="lesson.joinCode" />

          <div class="card">
            <div class="card-header">Lesson plan · step 4 of 8</div>
            <StepList :steps="steps" />
            <div class="card-body border-top d-grid gap-2">
              <button type="button" class="btn btn-primary">⚑ Save checkpoint for step 4</button>
              <small class="text-secondary text-center">Broadcasts to every student's laptop</small>
            </div>
          </div>

          <ErrorGroupList :groups="errorGroups" />
        </div>
      </div>

      <!-- Dashboard (full width below on xl; first on xs) -->
      <div class="col-12" :class="mobileTab === 'dashboard' ? 'order-first order-xl-last' : 'd-none d-xl-block order-xl-last'">
        <div class="d-flex flex-column gap-3">
          <ClassSummaryBar
            :counts="counts"
            :total="students.length"
            :lost-count="lostCount"
            :active="filter"
            @filter="filter = $event"
          />
          <TileGrid :tiles="students" :filter="filter" />
        </div>
      </div>
    </div>
  </div>
</template>
