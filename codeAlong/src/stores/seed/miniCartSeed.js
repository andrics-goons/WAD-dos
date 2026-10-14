// Seed for the student workspace: the "Week 6 · Mini Cart" lesson (design-docs/07-seed-and-demo.md).
//
// A real Vite + Vue project with a small Express API. `pnpm dev` runs both: Vite on 5173 and
// the API on 3001, with Vite proxying /api. No mock API: lessons ship their own server now.
//
// Shape follows the lessons table (03-data-model.md) in camelCase, as the api layer returns it:
//   files      [{ path, language, content }]   flat list; folders come from the "/" in each path
//   entryFile  the file the dev server starts from
//   devCommand what WebContainer runs after install
//   steps      what parseTodos(files, entryFile) should produce, so the Steps panel has data
//
// Generated from the project folder by scripts/generate-seed-v2.mjs. Edit the project, not this file.

export const miniCartSeed = {
  title: 'Week 6 · Mini Cart',
  week: 6,
  description: 'Props, emits, axios against a real Express API, a computed total and localStorage.',
  entryFile: 'index.html',
  devCommand: 'pnpm dev',
  status: 'ready',
  files: [
    {
      path: 'index.html',
      language: 'html',
      content: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" href="data:," />
    <title>Mini Cart</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>
`,
    },
    {
      path: 'package.json',
      language: 'json',
      content: `{
  "name": "mini-cart",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "concurrently --kill-others --names api,web \\"node server/api.js\\" \\"vite\\"",
    "build": "vite build"
  },
  "dependencies": {
    "axios": "^1.20.0",
    "vue": "^3.5.44"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^6.0.10",
    "concurrently": "^10.0.6",
    "express": "^5.3.0",
    "vite": "^8.1.5"
  }
}
`,
    },
    {
      path: 'vite.config.js',
      language: 'js',
      content: `import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    // Send every /api request to the Express server in server/api.js
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
`,
    },
    {
      path: 'README.md',
      language: 'md',
      content: `# Mini Cart

You're building a small grocery shop in Vue: pick a category, add items to a cart,
see the total, and check out. Along the way you'll use props and emits to pass data
between components, axios to call a real Express API, a computed property for the
total, and localStorage so the cart survives a refresh. Follow the numbered \`TODO\`
comments in order, starting in \`src/App.vue\`.
`,
    },
    {
      path: 'src/main.js',
      language: 'js',
      content: `// Reports errors and console output to your CodeAlong workspace. Keep this import first.
import './ca-probe.js'

import { createApp } from 'vue'
import App from './App.vue'
import './style.css'

createApp(App).mount('#app')
`,
    },
    {
      path: 'src/ca-probe.js',
      language: 'js',
      content: `// CodeAlong runtime probe: reports console output and errors to your CodeAlong workspace.
// You don't need to edit this file.
//
// PLACEHOLDER: the real probe (design-docs/05-core-logic.md §1) replaces this file.
export {}
`,
    },
    {
      path: 'src/App.vue',
      language: 'vue',
      content: `<script setup>
import { ref, onMounted } from 'vue'
import axios from 'axios'

const categories = ref([])
const selectedCategory = ref('')
const items = ref([])
const cart = ref([])
const receipt = ref(null)

// TODO 1: Create the Vue app with a list of categories
// Load them from GET /api/categories when the page opens, then select the first one.
onMounted(async () => {
})

// TODO 2: Fetch items for the selected category with axios
// Call GET /api/items with the selected category as a query parameter.
async function loadItems() {
}

// TODO 5: Add the item to the cart in the parent (increase quantity if it's already there)
function addToCart(item) {
}

// TODO 6: Show the cart total with a computed property

// TODO 7: Save the cart to localStorage and load it on start

// TODO 8: Add Reset and Checkout buttons (POST /api/checkout)
// Reset empties the cart. Checkout sends { cart } and shows the receipt that comes back.
</script>

<template>
  <header class="topbar">
    <h1>Mini Cart</h1>
    <span class="badge">{{ cart.length }} in cart</span>
  </header>

  <main class="layout">
    <section>
      <label for="category">Category</label>
      <select id="category" v-model="selectedCategory" @change="loadItems">
        <option v-for="category in categories" :key="category" :value="category">
          {{ category }}
        </option>
      </select>

      <!-- TODO 3: Create the ItemCard component with an items prop -->
      <!-- Then import ItemCard above, show it here, and listen for its add-to-cart event. -->
    </section>

    <aside class="cart">
      <h2>Your cart</h2>
      <p v-if="cart.length === 0" class="muted">Nothing here yet.</p>
      <ul v-else>
        <li v-for="line in cart" :key="line.id">
          <span>{{ line.name }} × {{ line.quantity }}</span>
          <span>\${{ (line.price * line.quantity).toFixed(2) }}</span>
        </li>
      </ul>

      <div v-if="receipt" class="receipt">
        <strong>Receipt #{{ receipt.receiptId }}</strong>
        <span>Paid \${{ receipt.total.toFixed(2) }}</span>
      </div>
    </aside>
  </main>
</template>
`,
    },
    {
      path: 'src/components/ItemCard.vue',
      language: 'vue',
      content: `<script setup>
// TODO 3: Create the ItemCard component with an items prop
// Declare the prop with defineProps. Each item looks like { id, name, price, emoji }.

// TODO 4: Emit add-to-cart from ItemCard
// Declare the event with defineEmits, then emit it from addToCart with the matching item.
function addToCart(id) {
}
</script>

<template>
  <div class="grid">
    <article v-for="item in items" :key="item.id" class="card">
      <div class="emoji">{{ item.emoji }}</div>
      <h3>{{ item.name }}</h3>
      <p class="price">\${{ item.price.toFixed(2) }}</p>
      <button @click="addToCart(item.id)">Add to cart</button>
    </article>
  </div>
</template>
`,
    },
    {
      path: 'src/style.css',
      language: 'css',
      content: `:root {
  --ink: #1f2933;
  --muted: #6b7280;
  --line: #e5e7eb;
  --accent: #2563eb;
  --bg: #f8fafc;
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  color: var(--ink);
  background: var(--bg);
}

body {
  margin: 0;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: white;
  border-bottom: 1px solid var(--line);
}

.topbar h1 {
  margin: 0;
  font-size: 1.25rem;
}

.badge {
  font-size: 0.875rem;
  color: var(--muted);
}

.layout {
  display: grid;
  gap: 20px;
  padding: 20px;
}

@media (min-width: 768px) {
  .layout {
    grid-template-columns: 1fr 300px;
  }
}

label {
  display: block;
  margin-bottom: 4px;
  font-weight: 600;
}

select {
  padding: 6px 8px;
  margin-bottom: 16px;
  text-transform: capitalize;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
}

.card {
  padding: 12px;
  background: white;
  border: 1px solid var(--line);
  border-radius: 8px;
  text-align: center;
}

.card h3 {
  margin: 4px 0;
  font-size: 1rem;
}

.emoji {
  font-size: 2rem;
}

.price {
  margin: 0 0 8px;
  color: var(--muted);
}

button {
  padding: 6px 12px;
  border: 0;
  border-radius: 6px;
  background: var(--accent);
  color: white;
  cursor: pointer;
}

.cart {
  padding: 16px;
  background: white;
  border: 1px solid var(--line);
  border-radius: 8px;
  align-self: start;
}

.cart h2 {
  margin-top: 0;
  font-size: 1.1rem;
}

.cart ul {
  padding: 0;
  list-style: none;
}

.cart li {
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
}

.muted {
  color: var(--muted);
}

.receipt {
  display: flex;
  flex-direction: column;
  margin-top: 12px;
  padding: 8px;
  background: #ecfdf5;
  border-radius: 6px;
}
`,
    },
    {
      path: 'server/api.js',
      language: 'js',
      content: `// Mini Cart API: a tiny Express server. Vite forwards every /api request here (see vite.config.js).
import express from 'express'
import { readFileSync } from 'node:fs'

const { categories, items } = JSON.parse(readFileSync(new URL('./data.json', import.meta.url), 'utf8'))

const app = express()
app.use(express.json())

app.get('/api/categories', (req, res) => {
  res.json(categories)
})

app.get('/api/items', (req, res) => {
  const { category } = req.query
  res.json(category ? items.filter((item) => item.category === category) : items)
})

// TODO 8: Add Reset and Checkout buttons (POST /api/checkout)
// Read req.body.cart, add up price × quantity, and send back { receiptId, cart, total }.
app.post('/api/checkout', (req, res) => {
  res.status(501).json({ error: 'Checkout is not built yet' })
})

app.listen(3001, () => {
  console.log('Mini Cart API running on http://localhost:3001')
})
`,
    },
    {
      path: 'server/data.json',
      language: 'json',
      content: `{
  "categories": ["fruit", "bakery", "drinks"],
  "items": [
    { "id": "fr1", "category": "fruit", "name": "Banana", "price": 0.6, "emoji": "🍌" },
    { "id": "fr2", "category": "fruit", "name": "Mango", "price": 2.4, "emoji": "🥭" },
    { "id": "fr3", "category": "fruit", "name": "Strawberries", "price": 4.9, "emoji": "🍓" },
    { "id": "fr4", "category": "fruit", "name": "Green apple", "price": 0.95, "emoji": "🍏" },
    { "id": "bk1", "category": "bakery", "name": "Wholemeal loaf", "price": 3.2, "emoji": "🍞" },
    { "id": "bk2", "category": "bakery", "name": "Croissant", "price": 2.1, "emoji": "🥐" },
    { "id": "bk3", "category": "bakery", "name": "Bagel", "price": 1.5, "emoji": "🥯" },
    { "id": "dr1", "category": "drinks", "name": "Soy milk", "price": 2.75, "emoji": "🥛" },
    { "id": "dr2", "category": "drinks", "name": "Sparkling water", "price": 1.3, "emoji": "💧" },
    { "id": "dr3", "category": "drinks", "name": "Iced lemon tea", "price": 1.8, "emoji": "🍋" }
  ]
}
`,
    },
  ],
  steps: [
    { order: 1, title: "Create the Vue app with a list of categories", todoRefs: [{file: "src/App.vue", line: 11}] },
    { order: 2, title: "Fetch items for the selected category with axios", todoRefs: [{file: "src/App.vue", line: 16}] },
    { order: 3, title: "Create the ItemCard component with an items prop", todoRefs: [{file: "src/App.vue", line: 48}, {file: "src/components/ItemCard.vue", line: 2}] },
    { order: 4, title: "Emit add-to-cart from ItemCard", todoRefs: [{file: "src/components/ItemCard.vue", line: 5}] },
    { order: 5, title: "Add the item to the cart in the parent (increase quantity if it's already there)", todoRefs: [{file: "src/App.vue", line: 21}] },
    { order: 6, title: "Show the cart total with a computed property", todoRefs: [{file: "src/App.vue", line: 25}] },
    { order: 7, title: "Save the cart to localStorage and load it on start", todoRefs: [{file: "src/App.vue", line: 27}] },
    { order: 8, title: "Add Reset and Checkout buttons (POST /api/checkout)", todoRefs: [{file: "src/App.vue", line: 29}, {file: "server/api.js", line: 19}] },
  ],
}

export default miniCartSeed