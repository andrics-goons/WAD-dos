<script setup>
// The landing page's hero background: an editor full of a class's code, scrolling past on a loop
// and fading out at the edges, so the headline sits on top of "a class in progress".
// Only decoration — the code is made up, and it stops moving for people who prefer less motion.
const SOURCE = `// Week 6 · Mini Cart
import { products } from './data.js'

const cart = []
const list = document.querySelector('#products')
const badge = document.querySelector('#cart-count')

function addToCart(id) {
  const item = products.find((p) => p.id === id)
  if (!item) return
  cart.push(item)
  render()
}

function total() {
  return cart.reduce((sum, item) => sum + item.price, 0)
}

function render() {
  badge.textContent = cart.length
  list.innerHTML = products
    .map((p) => \`<li>\${p.name} · $\${p.price}</li>\`)
    .join('')
  console.log('Total:', total().toFixed(2))
}

list.addEventListener('click', (event) => {
  const id = Number(event.target.dataset.id)
  addToCart(id)
})

export async function checkout() {
  const res = await fetch('/api/orders', {
    method: 'POST',
    body: JSON.stringify(cart),
  })
  return res.ok
}

render()`

const KEYWORDS = new Set([
  'const',
  'let',
  'function',
  'return',
  'import',
  'from',
  'export',
  'if',
  'async',
  'await',
])
// a comment, a string, a number, a word, or any other single character
const TOKEN = /(\/\/.*$)|('[^']*'|`[^`]*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)|(\s+|.)/g

function highlight(line) {
  return [...line.matchAll(TOKEN)].map((m) => {
    const [text, comment, string, number, word] = m
    let kind = 'plain'
    if (comment) kind = 'comment'
    else if (string) kind = 'string'
    else if (number) kind = 'number'
    else if (word && KEYWORDS.has(word)) kind = 'keyword'
    else if (word && line[m.index + text.length] === '(') kind = 'call'
    return { text, kind }
  })
}

const lines = SOURCE.split('\n').map(highlight)
// twice over, so scrolling by exactly one copy loops without a jump
const shown = [...lines, ...lines]
</script>

<template>
  <div class="code-backdrop ca-mono">
    <div class="code-backdrop__scroll">
      <div v-for="(tokens, i) in shown" :key="i" class="code-backdrop__line">
        <span class="code-backdrop__number">{{ (i % lines.length) + 1 }}</span>
        <span v-for="(t, j) in tokens" :key="j" :class="`tok-${t.kind}`">{{ t.text }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* a tilted sheet of code, like an editor seen at an angle, fading out at the top and bottom */
.code-backdrop {
  position: absolute;
  inset: -25% -10%;
  overflow: hidden;
  padding-left: 22%;
  font-size: var(--ca-text-lg);
  line-height: 2;
  white-space: pre;
  color: var(--ca-ide-text);
  opacity: 0.55;
  transform: perspective(1200px) rotateX(30deg) rotateZ(-8deg);
  mask-image: linear-gradient(transparent, #000 30%, #000 65%, transparent);
}
.code-backdrop__scroll {
  animation: code-scroll 70s linear infinite;
}
.code-backdrop__number {
  display: inline-block;
  width: 3ch;
  margin-right: var(--ca-space-4);
  text-align: right;
  color: var(--ca-ide-muted);
}
.tok-keyword {
  color: #ff7b72;
}
.tok-string {
  color: #a5d6ff;
}
.tok-number {
  color: #79c0ff;
}
.tok-call {
  color: #d2a8ff;
}
.tok-comment {
  color: var(--ca-ide-muted);
}
@keyframes code-scroll {
  to {
    transform: translateY(-50%);
  }
}
@media (prefers-reduced-motion: reduce) {
  .code-backdrop__scroll {
    animation: none;
  }
}
</style>
