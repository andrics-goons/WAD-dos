// A small stand-in for the Mini Cart lesson, kept here so the unit tests don't depend on the
// workspace seed. It reproduces the cases that matter: eight numbered TODOs across .vue, .js
// and .html files, with TODO 3 and TODO 8 each appearing in two files.

export const miniCartFiles = [
  {
    path: 'index.html',
    content: `<!DOCTYPE html>
<html lang="en">
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>
`,
  },
  {
    path: 'package.json',
    content: '{ "name": "mini-cart", "scripts": { "dev": "vite" } }\n',
  },
  {
    path: 'src/main.js',
    content: `import { createApp } from 'vue'
import App from './App.vue'

// TODO 1: Create the Vue app with a list of categories
createApp(App).mount('#app')
`,
  },
  {
    path: 'src/App.vue',
    content: `<template>
  <!-- TODO 3: Create the ItemCard component with an items prop -->
  <ItemCard :items="items" @add-to-cart="addToCart" />
  <p>Total: {{ total }}</p>
</template>

<script setup>
import axios from 'axios'
// TODO 2: Fetch items for the selected category with axios
// TODO 5: Add the item to the cart in the parent (increase quantity if it's already there)
// TODO 6: Show the cart total with a computed property
// TODO 7: Save the cart to localStorage and load it on start
// TODO 8: Add Reset and Checkout buttons (POST /api/checkout)
</script>
`,
  },
  {
    path: 'src/components/ItemCard.vue',
    content: `<script setup>
// TODO 3: Create the ItemCard component with an items prop
// TODO 4: Emit add-to-cart from ItemCard
</script>
`,
  },
  {
    path: 'server/api.js',
    content: `import express from 'express'
const app = express()

// TODO 8: Add Reset and Checkout buttons (POST /api/checkout)
app.post('/api/checkout', (req, res) => res.json({ ok: true }))
`,
  },
]

export const miniCartEntryFile = 'index.html'
