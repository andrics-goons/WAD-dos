// Manual test bench for the help request analysis (not part of the app). Runs the real prompt
// and parser from supabase/functions/analyze-help against Groq and shows the diagnosis.
// No Docker or Supabase needed. Run from codeAlong/:
//
//   node --env-file=supabase/functions/.env scripts/try-analyze-help.mjs --serve
//       opens a test page at http://localhost:5179: edit a broken student's code, click Analyse
//   node --env-file=supabase/functions/.env scripts/try-analyze-help.mjs
//       runs every built-in broken-student example in the terminal
//   node --env-file=supabase/functions/.env scripts/try-analyze-help.mjs missing-prop
//       runs one example (see the names in SCENARIOS below)
//   node --env-file=supabase/functions/.env scripts/try-analyze-help.mjs --folder <path> --error "<message>"
//       analyses your own project folder. Optional: --file <path> --line <n> --step "<step title>"
//   add --prompt to the terminal commands to also print what is sent to the model
//
// supabase/functions/.env holds LLM_API_KEY (and optionally LLM_MODEL). It is git-ignored and
// must never be committed or put in a VITE_ variable, which would ship to the browser. The test
// page never sees the key: the browser posts to this script, and this script calls Groq.
// Each analysis uses one request from the Groq free tier (about 1,000 a day).
import process from 'node:process'
import { createServer } from 'node:http'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { buildLessonFiles, isIgnored, languageForPath } from '../shared/lesson-files.js'
import { buildPrompt, parseAnalysis } from '../supabase/functions/analyze-help/analysis.ts'
import { DEFAULT_MODEL } from '../supabase/functions/analyze-help/handler.ts'
import { handleSummarize } from '../supabase/functions/summarize-help/handler.ts'
import { buildSummaryPrompt, groupAnalyses } from '../supabase/functions/summarize-help/summary.ts'
import { createGroqClient } from '../supabase/functions/_shared/groq.ts'

const key = process.env.LLM_API_KEY
const model = process.env.LLM_MODEL || DEFAULT_MODEL
const args = process.argv.slice(2)
const showPrompt = args.includes('--prompt')
const PORT = 5179

function fail(message) {
  console.error(message)
  process.exit(1)
}

const option = (name) => {
  const i = args.indexOf(name)
  return i === -1 ? undefined : args[i + 1]
}

// ── Built-in examples: a Mini Cart student stuck in a different way each time ──
const ITEM_CARD = `<template>
  <div class="card">{{ item.name }} - \${{ item.price }}
    <button @click="$emit('add-to-cart', item)">Add</button>
  </div>
</template>
<script setup>
defineProps({ item: Object })
</script>`

const APP = `<template>
  <h1>Mini Cart</h1>
  <!-- TODO 4: Show each item with ItemCard and listen for add-to-cart -->
  <ItemCard v-for="item in items" :key="item.id" :item="item" @add-to-cart="addToCart" />
  <p>Total: {{ total }}</p>
</template>
<script setup>
import { ref, computed } from 'vue'
import ItemCard from './components/ItemCard.vue'
const items = ref([{ id: 1, name: 'Pen', price: 2 }, { id: 2, name: 'Book', price: 12 }])
const cart = ref([])
const total = computed(() => cart.value.reduce((sum, i) => sum + i.price, 0))
function addToCart(item) { cart.value.push(item) }
</script>`

const files = (app, card = ITEM_CARD) => [
  { path: 'src/App.vue', content: app },
  { path: 'src/components/ItemCard.vue', content: card },
]
const STEP = {
  order: 4,
  title: 'Show each item with ItemCard and listen for add-to-cart',
  todoRefs: [{ file: 'src/App.vue', line: 3 }],
}
// the fixed version of the app is the "checkpoint" every example is compared against
const CHECKPOINT = files(APP)

const SCENARIOS = {
  'missing-prop': {
    about: 'Forgot to pass :item to ItemCard',
    files: files(APP.replace(' :item="item"', '')),
    error: {
      name: 'TypeError',
      message: "Cannot read properties of undefined (reading 'name')",
      file: 'src/components/ItemCard.vue',
      line: 2,
    },
  },
  typo: {
    about: 'Misspelt items in the v-for',
    files: files(APP.replace('item in items', 'item in itmes')),
    error: {
      name: 'ReferenceError',
      message: 'itmes is not defined',
      file: 'src/App.vue',
      line: 4,
    },
  },
  'wrong-import': {
    about: 'Wrong path when importing ItemCard',
    files: files(APP.replace('./components/ItemCard.vue', './ItemCard.vue')),
    error: {
      name: 'Error',
      message: 'Failed to resolve import "./ItemCard.vue" from "src/App.vue". Does the file exist?',
      file: 'src/App.vue',
      line: 9,
    },
  },
  'no-error': {
    about: 'Nothing crashes, but Add never updates the total (listener missing)',
    files: files(APP.replace(' @add-to-cart="addToCart"', '')),
    error: null,
  },
}

// ── Your own folder ──
function readFolder(dir) {
  const entries = []
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name)
      const path = relative(dir, full).replaceAll('\\', '/')
      if (isIgnored(path) || entry.name === '.git') continue
      if (entry.isDirectory()) walk(full)
      else if (languageForPath(path)) entries.push({ path, content: readFileSync(full, 'utf8') })
    }
  }
  walk(dir)
  const { files, errors } = buildLessonFiles(entries)
  if (errors.length) fail(`That folder can't be a lesson: ${errors.join(' ')}`)
  return files
}

// ── One analysis, shared by the terminal and the test page ──
// Returns { ok, analysis | error, raw?, ms, model, prompt }
async function runAnalysis(ctx) {
  const messages = buildPrompt(ctx)
  const prompt = messages[1].content
  const llm = createGroqClient(fetch, key)
  const started = Date.now()

  let result = await llm({ model, messages })
  if (result.status === 429) {
    // Groq's free tier allows ~8K tokens a minute; wait out the limit once
    await new Promise((resolve) => setTimeout(resolve, (result.retryAfter ?? 10) * 1000))
    result = await llm({ model, messages })
  }
  const ms = Date.now() - started
  if (!result.ok) return { ok: false, error: `Groq replied ${result.status}`, ms, model, prompt }

  try {
    return { ok: true, analysis: parseAnalysis(result.text, ctx), ms, model, prompt }
  } catch (err) {
    return { ok: false, error: err.message, raw: result.text, ms, model, prompt }
  }
}

async function printAnalysis(name, about, ctx) {
  console.log(`\n━━ ${name} ━━ ${about}`)
  const e = ctx.error
  console.log(`error: ${e ? `${e.name}: ${e.message}` : '(none reported)'}`)
  const r = await runAnalysis(ctx)
  if (showPrompt) console.log(`\n--- prompt sent ---\n${r.prompt}\n--- end ---`)
  if (!r.ok) return console.log(`✗ ${r.error}${r.raw ? `. Raw reply:\n${r.raw}` : ''}`)

  const a = r.analysis
  const where = [a.stuckAt.file, a.stuckAt.line].filter(Boolean).join(':') || 'unknown'
  console.log(`(${r.ms} ms, ${r.model})`)
  console.log(`summary    : ${a.summary}`)
  console.log(`category   : ${a.category}   confidence: ${a.confidence}`)
  console.log(`stuck at   : step ${a.stuckAt.step} · ${where}`)
  console.log(`root cause : ${a.rootCause}`)
}

// ── Test page ──
const send = (res, status, body, type = 'application/json') => {
  res.writeHead(status, { 'content-type': `${type}; charset=utf-8` })
  res.end(type === 'application/json' ? JSON.stringify(body) : body)
}

async function readJson(req) {
  let body = ''
  for await (const chunk of req) {
    body += chunk
    if (body.length > 300_000) throw new Error('request too large')
  }
  return JSON.parse(body)
}

// Only accept the shape the page sends; anything else is a 400
function contextFromPage(body) {
  const fileList = (list) =>
    Array.isArray(list)
      ? list.filter((f) => typeof f?.path === 'string' && typeof f?.content === 'string')
      : []
  const e = body?.error
  return {
    type: 'help',
    step: { ...STEP, title: String(body?.stepTitle || STEP.title).slice(0, 120) },
    files: fileList(body?.files),
    checkpointFiles: body?.useCheckpoint ? CHECKPOINT : null,
    error: e?.message
      ? {
          name: String(e.name || 'Error'),
          message: String(e.message).slice(0, 300),
          file: e.file ? String(e.file) : undefined,
          line: Number(e.line) || undefined,
        }
      : null,
  }
}

// A ready-made class of part 1 results, so pipeline 2 can be tried without analysing 12 students
const sample = (category, summary, rootCause, file, line) => ({
  stepOrder: 4,
  stepTitle: STEP.title,
  analysis: { summary, rootCause, category, stuckAt: { file, line }, confidence: 'high' },
})
const SAMPLE_CLASS = [
  ...Array.from({ length: 6 }, () =>
    sample(
      'missing-prop',
      'ItemCard gets no item, so item.name is undefined',
      'The <ItemCard> tag has no :item binding, so the prop is undefined inside the card. The student declared the prop but seems to think it fills in automatically.',
      'src/App.vue',
      4,
    ),
  ),
  ...Array.from({ length: 3 }, () =>
    sample(
      'event-not-emitted',
      'Add never updates the total',
      'App.vue never listens for add-to-cart on <ItemCard>, so addToCart is never called and the cart stays empty. The student may expect emitted events to reach the parent on their own.',
      'src/App.vue',
      4,
    ),
  ),
  ...Array.from({ length: 2 }, () =>
    sample(
      'typo',
      'items is misspelt in the v-for',
      'The template loops over itmes, which does not exist, so Vue throws a ReferenceError. A simple spelling slip.',
      'src/App.vue',
      4,
    ),
  ),
  sample(
    'wrong-import',
    'ItemCard imported from the wrong folder',
    'App.vue imports ./ItemCard.vue but the file lives in components/, so the build fails to resolve it.',
    'src/App.vue',
    9,
  ),
]

// Runs the real summarize-help handler, with the page's analyses standing in for the database
async function runSummary(analysed) {
  const deps = {
    env: (name) => process.env[name],
    db: { isSessionStaff: async () => true, listAnalyses: async () => ({ analysed, pending: 0 }) },
    outbox: { from: () => ({ insert: async () => ({ error: null }) }) },
    llm: createGroqClient(fetch, key),
  }
  const started = Date.now()
  const res = await handleSummarize(
    new Request('http://test-bench/summarize-help', {
      method: 'POST',
      body: JSON.stringify({ sessionId: 'test-bench' }),
    }),
    deps,
  )
  const summary = await res.json()
  const prompt = buildSummaryPrompt(groupAnalyses(analysed), analysed.length)[1].content
  return { ...summary, ms: Date.now() - started, prompt }
}

// Only keep analyses shaped like part 1's output
function analysesFromPage(list) {
  return (Array.isArray(list) ? list : [])
    .filter((r) => r?.analysis?.summary && r?.analysis?.category)
    .slice(0, 100)
    .map((r) => ({
      stepOrder: Number(r.stepOrder) || 1,
      stepTitle: String(r.stepTitle || STEP.title).slice(0, 120),
      analysis: r.analysis,
    }))
}

function serve() {
  const page = readFileSync(new URL('./try-analyze-help.html', import.meta.url), 'utf8')
  const server = createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/') return send(res, 200, page, 'text/html')
      if (req.method === 'GET' && req.url === '/examples') {
        return send(res, 200, { model, step: STEP, examples: SCENARIOS })
      }
      if (req.method === 'POST' && req.url === '/analyse') {
        const ctx = contextFromPage(await readJson(req))
        if (!ctx.files.length) return send(res, 400, { ok: false, error: 'Add at least one file' })
        return send(res, 200, await runAnalysis(ctx))
      }
      if (req.method === 'POST' && req.url === '/summarise') {
        const body = await readJson(req)
        const analysed = body?.useSample ? SAMPLE_CLASS : analysesFromPage(body?.analyses)
        if (!analysed.length) return send(res, 400, { error: 'Analyse at least one student first' })
        return send(res, 200, await runSummary(analysed))
      }
      send(res, 404, { error: 'not found' })
    } catch (err) {
      send(res, 400, { ok: false, error: err.message })
    }
  })
  // 127.0.0.1 only: the page can spend your Groq quota, so it must not be reachable from the network
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`Test page: http://localhost:${PORT}   (model ${model})   Ctrl+C to stop`)
  })
}

// ── Main ──
if (!key)
  fail(
    'LLM_API_KEY is not set. Put it in supabase/functions/.env and run with --env-file (see the top of this file).',
  )

if (args.includes('--serve')) {
  serve()
} else if (option('--folder')) {
  const message = option('--error')
  await printAnalysis(option('--folder'), 'your folder', {
    type: 'help',
    step: { order: 1, title: option('--step') ?? 'The current step', todoRefs: [] },
    files: readFolder(option('--folder')),
    checkpointFiles: null,
    error: message
      ? {
          name: 'Error',
          message,
          file: option('--file'),
          line: Number(option('--line')) || undefined,
        }
      : null,
  })
} else {
  const wanted = args.find((a) => !a.startsWith('--'))
  if (wanted && !SCENARIOS[wanted]) {
    fail(`No example called "${wanted}". Try: ${Object.keys(SCENARIOS).join(', ')}`)
  }
  for (const [name, s] of Object.entries(SCENARIOS)) {
    if (wanted && wanted !== name) continue
    await printAnalysis(name, s.about, {
      type: 'help',
      step: STEP,
      files: s.files,
      checkpointFiles: CHECKPOINT,
      error: s.error,
    })
  }
}
