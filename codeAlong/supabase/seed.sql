-- supabase/seed.sql — demo data. Runs after the migrations on every `supabase db reset`
-- (pnpm db:reset), so it starts from an empty database every time: no clean-up step.
-- Spec: design-docs/07-seed-and-demo.md
--
-- Every account's password: pass1234
--
-- What's here:
--   17 users · 3 courses (Prof Lee's current + archived term, Prof Tan's) · the Mini Cart lesson
--   in each · one PAST session with full history, help, notes and a report · two older
--   reports for trends · one LIVE session (join code CART42) for building the dashboard
--   until start_session exists.
--
-- Fixed ids, grouped by table, so every insert can point at earlier rows:
--   users        00000000-0000-0000-0000-0000000000NN   (NN = the # in 07's user table)
--   courses      00000000-0000-0000-0001-00000000000N
--   lessons      00000000-0000-0000-0002-00000000000N   (lesson N is in course N)
--   steps        00000000-0000-0000-0003-00000000N00K   (step K of lesson N)
--   sessions     00000000-0000-0000-0004-00000000000N


-- Scratch space for building the data; dropped at the end.
create schema seed;


-- 1. Users ------------------------------------
-- Passwords are hashed by crypt(), the same bcrypt Supabase Auth uses — never by us.
-- on_auth_user_created creates each profiles row (as 'student'); step 2 sets the roles.

create table seed.users (n int primary key, id uuid, name text, email text, role text);
insert into seed.users (n, name, email, role) values
    ( 1, 'Prof Lee',  'prof@codealong.test',     'prof'),
    ( 2, 'Ana Lim',   'ta.ana@codealong.test',   'ta'),
    ( 3, 'Ben Ong',   'ta.ben@codealong.test',   'ta'),
    ( 4, 'Alex Tan',  'alex@codealong.test',     'student'),
    ( 5, 'Bea Koh',   'bea@codealong.test',      'student'),
    ( 6, 'Chen Wei',  'chen@codealong.test',     'student'),
    ( 7, 'Dana',      'dana@codealong.test',     'student'),
    ( 8, 'Eli',       'eli@codealong.test',      'student'),
    ( 9, 'Faye',      'faye@codealong.test',     'student'),
    (10, 'Gus',       'gus@codealong.test',      'student'),
    (11, 'Hana',      'hana@codealong.test',     'student'),
    (12, 'Ivan',      'ivan@codealong.test',     'student'),
    (13, 'Jae',       'jae@codealong.test',      'student'),
    (14, 'Kim',       'kim@codealong.test',      'student'),
    (15, 'Zoe Ng',    'zoe@codealong.test',      'student'),   -- NOT enrolled anywhere
    (16, 'Prof Tan',  'prof.tan@codealong.test', 'prof'),
    (17, 'Ada Admin', 'admin@codealong.test',    'admin');     -- the one admin
update seed.users set id = ('00000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid;

create function seed.u(p int) returns uuid language sql immutable as $$
    select ('00000000-0000-0000-0000-' || lpad(p::text, 12, '0'))::uuid
$$;

-- The empty-string token columns matter: Supabase Auth fails to log in a user whose
-- tokens are NULL ("converting NULL to string").
insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', email,
       extensions.crypt('pass1234', extensions.gen_salt('bf')), now(),
       '{"provider": "email", "providers": ["email"]}', jsonb_build_object('name', name),
       now(), now(), '', '', '', ''
  from seed.users;

-- the email identity is what email + password sign-in looks up
insert into auth.identities (user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select id, id::text, 'email',
       jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true),
       now(), now(), now()
  from seed.users;


-- 2. Roles ------------------------------------
-- Run as the database owner, so the "can't change your own role" policy doesn't apply.
-- In the app, ta comes from add_course_staff and admin only from here or another admin.

update public.profiles p set role = u.role from seed.users u where p.id = u.id;


-- 3. Courses, staff, students ------------------------------------

insert into public.courses (id, code, title, term, section, owner_id, enrol_code, archived) values
    ('00000000-0000-0000-0001-000000000001', 'IS216', 'Web Application Development II', 'AY2026/27 T1', 'G2', seed.u(1),  'WAD2G2', false),
    -- last term, archived: its report gives "recurring trouble across terms" something to find
    ('00000000-0000-0000-0001-000000000002', 'IS216', 'Web Application Development II', 'AY2025/26 T1', 'G2', seed.u(1),  'WADG25', true),
    -- Prof Tan's: Prof Lee must never see it, and his trends must never count it
    ('00000000-0000-0000-0001-000000000003', 'IS216', 'Web Application Development II', 'AY2026/27 T1', 'G1', seed.u(16), 'TANWAD', false);

insert into public.course_staff (course_id, user_id, role) values
    ('00000000-0000-0000-0001-000000000001', seed.u(1),  'prof'),
    ('00000000-0000-0000-0001-000000000001', seed.u(2),  'ta'),
    ('00000000-0000-0000-0001-000000000001', seed.u(3),  'ta'),
    ('00000000-0000-0000-0001-000000000002', seed.u(1),  'prof'),
    ('00000000-0000-0000-0001-000000000002', seed.u(2),  'ta'),
    ('00000000-0000-0000-0001-000000000003', seed.u(16), 'prof');

-- Alex … Kim (users 4–14) in the current course. Zoe (15) is deliberately left out.
insert into public.course_students (course_id, user_id)
select '00000000-0000-0000-0001-000000000001', seed.u(n) from generate_series(4, 14) n;


-- 4. The Mini Cart lesson ------------------------------------
-- Starter files: copied from Dylan's src/stores/seed/miniCartSeed.js (branch
-- dylan-workspace, d41288a), the same project the workspace boots. If that project
-- changes, re-copy this list — the patches in step 5 raise an error if their text is gone.

create table seed.starter (files jsonb);
insert into seed.starter values ($mc$[
  {
    "path": "index.html",
    "language": "html",
    "content": "<!DOCTYPE html>\n<html lang=\"en\">\n  <head>\n    <meta charset=\"UTF-8\" />\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />\n    <link rel=\"icon\" href=\"data:,\" />\n    <title>Mini Cart</title>\n  </head>\n  <body>\n    <div id=\"app\"></div>\n    <script type=\"module\" src=\"/src/main.js\"></script>\n  </body>\n</html>\n"
  },
  {
    "path": "package.json",
    "language": "json",
    "content": "{\n  \"name\": \"mini-cart\",\n  \"version\": \"0.0.0\",\n  \"private\": true,\n  \"type\": \"module\",\n  \"scripts\": {\n    \"dev\": \"concurrently --kill-others --names api,web \\\"node server/api.js\\\" \\\"vite\\\"\",\n    \"build\": \"vite build\"\n  },\n  \"dependencies\": {\n    \"axios\": \"^1.20.0\",\n    \"vue\": \"^3.5.44\"\n  },\n  \"devDependencies\": {\n    \"@napi-rs/wasm-runtime\": \"1.2.5\",\n    \"@rolldown/binding-wasm32-wasi\": \"1.2.15\",\n    \"@vitejs/plugin-vue\": \"^6.0.10\",\n    \"concurrently\": \"^10.0.6\",\n    \"express\": \"^5.3.0\",\n    \"vite\": \"^8.1.5\"\n  }\n}\n"
  },
  {
    "path": "vite.config.js",
    "language": "js",
    "content": "import { defineConfig } from 'vite'\nimport vue from '@vitejs/plugin-vue'\n\n// https://vite.dev/config/\nexport default defineConfig({\n  plugins: [vue()],\n  server: {\n    // Send every /api request to the Express server in server/api.js\n    proxy: {\n      '/api': 'http://localhost:3001',\n    },\n  },\n})\n"
  },
  {
    "path": "README.md",
    "language": "md",
    "content": "# Mini Cart\n\nYou're building a small grocery shop in Vue: pick a category, add items to a cart,\nsee the total, and check out. Along the way you'll use props and emits to pass data\nbetween components, axios to call a real Express API, a computed property for the\ntotal, and localStorage so the cart survives a refresh. Follow the numbered `TODO`\ncomments in order, starting in `src/App.vue`.\n"
  },
  {
    "path": "src/main.js",
    "language": "js",
    "content": "// Reports errors and console output to your CodeAlong workspace. Keep this import first.\nimport './ca-probe.js'\n\nimport { createApp } from 'vue'\nimport App from './App.vue'\nimport './style.css'\n\ncreateApp(App).mount('#app')\n"
  },
  {
    "path": "src/ca-probe.js",
    "language": "js",
    "content": "// CodeAlong runtime probe: reports console output and errors to your CodeAlong workspace.\n// You don't need to edit this file.\n//\n// PLACEHOLDER: the real probe (design-docs/05-core-logic.md §1) replaces this file.\nexport {}\n"
  },
  {
    "path": "src/App.vue",
    "language": "vue",
    "content": "<script setup>\nimport { ref, onMounted } from 'vue'\nimport axios from 'axios'\n\nconst categories = ref([])\nconst selectedCategory = ref('')\nconst items = ref([])\nconst cart = ref([])\nconst receipt = ref(null)\n\n// TODO 1: Create the Vue app with a list of categories\n// Load them from GET /api/categories when the page opens, then select the first one.\nonMounted(async () => {\n})\n\n// TODO 2: Fetch items for the selected category with axios\n// Call GET /api/items with the selected category as a query parameter.\nasync function loadItems() {\n}\n\n// TODO 5: Add the item to the cart in the parent (increase quantity if it's already there)\nfunction addToCart(item) {\n}\n\n// TODO 6: Show the cart total with a computed property\n\n// TODO 7: Save the cart to localStorage and load it on start\n\n// TODO 8: Add Reset and Checkout buttons (POST /api/checkout)\n// Reset empties the cart. Checkout sends { cart } and shows the receipt that comes back.\n</script>\n\n<template>\n  <header class=\"topbar\">\n    <h1>Mini Cart</h1>\n    <span class=\"badge\">{{ cart.length }} in cart</span>\n  </header>\n\n  <main class=\"layout\">\n    <section>\n      <label for=\"category\">Category</label>\n      <select id=\"category\" v-model=\"selectedCategory\" @change=\"loadItems\">\n        <option v-for=\"category in categories\" :key=\"category\" :value=\"category\">\n          {{ category }}\n        </option>\n      </select>\n\n      <!-- TODO 3: Create the ItemCard component with an items prop -->\n      <!-- Then import ItemCard above, show it here, and listen for its add-to-cart event. -->\n    </section>\n\n    <aside class=\"cart\">\n      <h2>Your cart</h2>\n      <p v-if=\"cart.length === 0\" class=\"muted\">Nothing here yet.</p>\n      <ul v-else>\n        <li v-for=\"line in cart\" :key=\"line.id\">\n          <span>{{ line.name }} × {{ line.quantity }}</span>\n          <span>${{ (line.price * line.quantity).toFixed(2) }}</span>\n        </li>\n      </ul>\n\n      <div v-if=\"receipt\" class=\"receipt\">\n        <strong>Receipt #{{ receipt.receiptId }}</strong>\n        <span>Paid ${{ receipt.total.toFixed(2) }}</span>\n      </div>\n    </aside>\n  </main>\n</template>\n"
  },
  {
    "path": "src/components/ItemCard.vue",
    "language": "vue",
    "content": "<script setup>\n// TODO 3: Create the ItemCard component with an items prop\n// Declare the prop with defineProps. Each item looks like { id, name, price, emoji }.\n\n// TODO 4: Emit add-to-cart from ItemCard\n// Declare the event with defineEmits, then emit it from addToCart with the matching item.\nfunction addToCart(id) {\n}\n</script>\n\n<template>\n  <div class=\"grid\">\n    <article v-for=\"item in items\" :key=\"item.id\" class=\"card\">\n      <div class=\"emoji\">{{ item.emoji }}</div>\n      <h3>{{ item.name }}</h3>\n      <p class=\"price\">${{ item.price.toFixed(2) }}</p>\n      <button @click=\"addToCart(item.id)\">Add to cart</button>\n    </article>\n  </div>\n</template>\n"
  },
  {
    "path": "src/style.css",
    "language": "css",
    "content": ":root {\n  --ink: #1f2933;\n  --muted: #6b7280;\n  --line: #e5e7eb;\n  --accent: #2563eb;\n  --bg: #f8fafc;\n  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;\n  color: var(--ink);\n  background: var(--bg);\n}\n\nbody {\n  margin: 0;\n}\n\n.topbar {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  padding: 12px 20px;\n  background: white;\n  border-bottom: 1px solid var(--line);\n}\n\n.topbar h1 {\n  margin: 0;\n  font-size: 1.25rem;\n}\n\n.badge {\n  font-size: 0.875rem;\n  color: var(--muted);\n}\n\n.layout {\n  display: grid;\n  gap: 20px;\n  padding: 20px;\n}\n\n@media (min-width: 768px) {\n  .layout {\n    grid-template-columns: 1fr 300px;\n  }\n}\n\nlabel {\n  display: block;\n  margin-bottom: 4px;\n  font-weight: 600;\n}\n\nselect {\n  padding: 6px 8px;\n  margin-bottom: 16px;\n  text-transform: capitalize;\n}\n\n.grid {\n  display: grid;\n  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));\n  gap: 12px;\n}\n\n.card {\n  padding: 12px;\n  background: white;\n  border: 1px solid var(--line);\n  border-radius: 8px;\n  text-align: center;\n}\n\n.card h3 {\n  margin: 4px 0;\n  font-size: 1rem;\n}\n\n.emoji {\n  font-size: 2rem;\n}\n\n.price {\n  margin: 0 0 8px;\n  color: var(--muted);\n}\n\nbutton {\n  padding: 6px 12px;\n  border: 0;\n  border-radius: 6px;\n  background: var(--accent);\n  color: white;\n  cursor: pointer;\n}\n\n.cart {\n  padding: 16px;\n  background: white;\n  border: 1px solid var(--line);\n  border-radius: 8px;\n  align-self: start;\n}\n\n.cart h2 {\n  margin-top: 0;\n  font-size: 1.1rem;\n}\n\n.cart ul {\n  padding: 0;\n  list-style: none;\n}\n\n.cart li {\n  display: flex;\n  justify-content: space-between;\n  padding: 4px 0;\n}\n\n.muted {\n  color: var(--muted);\n}\n\n.receipt {\n  display: flex;\n  flex-direction: column;\n  margin-top: 12px;\n  padding: 8px;\n  background: #ecfdf5;\n  border-radius: 6px;\n}\n"
  },
  {
    "path": "server/api.js",
    "language": "js",
    "content": "// Mini Cart API: a tiny Express server. Vite forwards every /api request here (see vite.config.js).\nimport express from 'express'\nimport { readFileSync } from 'node:fs'\n\nconst { categories, items } = JSON.parse(readFileSync(new URL('./data.json', import.meta.url), 'utf8'))\n\nconst app = express()\napp.use(express.json())\n\napp.get('/api/categories', (req, res) => {\n  res.json(categories)\n})\n\napp.get('/api/items', (req, res) => {\n  const { category } = req.query\n  res.json(category ? items.filter((item) => item.category === category) : items)\n})\n\n// TODO 8: Add Reset and Checkout buttons (POST /api/checkout)\n// Read req.body.cart, add up price × quantity, and send back { receiptId, cart, total }.\napp.post('/api/checkout', (req, res) => {\n  res.status(501).json({ error: 'Checkout is not built yet' })\n})\n\napp.listen(3001, () => {\n  console.log('Mini Cart API running on http://localhost:3001')\n})\n"
  },
  {
    "path": "server/data.json",
    "language": "json",
    "content": "{\n  \"categories\": [\"fruit\", \"bakery\", \"drinks\"],\n  \"items\": [\n    { \"id\": \"fr1\", \"category\": \"fruit\", \"name\": \"Banana\", \"price\": 0.6, \"emoji\": \"🍌\" },\n    { \"id\": \"fr2\", \"category\": \"fruit\", \"name\": \"Mango\", \"price\": 2.4, \"emoji\": \"🥭\" },\n    { \"id\": \"fr3\", \"category\": \"fruit\", \"name\": \"Strawberries\", \"price\": 4.9, \"emoji\": \"🍓\" },\n    { \"id\": \"fr4\", \"category\": \"fruit\", \"name\": \"Green apple\", \"price\": 0.95, \"emoji\": \"🍏\" },\n    { \"id\": \"bk1\", \"category\": \"bakery\", \"name\": \"Wholemeal loaf\", \"price\": 3.2, \"emoji\": \"🍞\" },\n    { \"id\": \"bk2\", \"category\": \"bakery\", \"name\": \"Croissant\", \"price\": 2.1, \"emoji\": \"🥐\" },\n    { \"id\": \"bk3\", \"category\": \"bakery\", \"name\": \"Bagel\", \"price\": 1.5, \"emoji\": \"🥯\" },\n    { \"id\": \"dr1\", \"category\": \"drinks\", \"name\": \"Soy milk\", \"price\": 2.75, \"emoji\": \"🥛\" },\n    { \"id\": \"dr2\", \"category\": \"drinks\", \"name\": \"Sparkling water\", \"price\": 1.3, \"emoji\": \"💧\" },\n    { \"id\": \"dr3\", \"category\": \"drinks\", \"name\": \"Iced lemon tea\", \"price\": 1.8, \"emoji\": \"🍋\" }\n  ]\n}\n"
  }
]$mc$);

create table seed.step_titles (k int primary key, title text);
insert into seed.step_titles values
    (1, 'Create the Vue app with a list of categories'),
    (2, 'Fetch items for the selected category with axios'),
    (3, 'Create the ItemCard component with an items prop'),
    (4, 'Emit add-to-cart from ItemCard'),
    (5, 'Add the item to the cart in the parent (increase quantity if it''s already there)'),
    (6, 'Show the cart total with a computed property'),
    (7, 'Save the cart to localStorage and load it on start'),
    (8, 'Add Reset and Checkout buttons (POST /api/checkout)');

create function seed.step(lesson int, k int) returns uuid language sql immutable as $$
    select ('00000000-0000-0000-0003-' || lpad((lesson * 1000 + k)::text, 12, '0'))::uuid
$$;

-- The same lesson in all three courses (lessons belong to a course, so each needs a copy).
insert into public.lessons (id, course_id, title, week, description, files, entry_file, status, created_by)
select ('00000000-0000-0000-0002-' || lpad(n::text, 12, '0'))::uuid,
       ('00000000-0000-0000-0001-' || lpad(n::text, 12, '0'))::uuid,
       'Week 6 · Mini Cart', 6,
       'Props, emits, axios against a real Express API, a computed total and localStorage.',
       (select files from seed.starter), 'index.html', 'ready',
       case n when 3 then seed.u(16) else seed.u(1) end
  from generate_series(1, 3) n;

-- Eight steps per lesson. todo_refs = every file + line where "TODO k:" appears in the
-- starter, which is what parseTodos produces.
insert into public.steps (id, lesson_id, "order", title, todo_refs)
select seed.step(n, t.k),
       ('00000000-0000-0000-0002-' || lpad(n::text, 12, '0'))::uuid,
       t.k, t.title,
       (select coalesce(jsonb_agg(jsonb_build_object('file', f.e->>'path', 'line', l.n) order by f.i, l.n), '[]')
          from seed.starter s,
               jsonb_array_elements(s.files) with ordinality f(e, i),
               unnest(string_to_array(f.e->>'content', E'\n')) with ordinality l(text, n)
         where l.text like '%TODO ' || t.k || ':%')
  from generate_series(1, 3) n, seed.step_titles t;


-- 5. The prof's code at each step ------------------------------------
-- Checkpoint k = the starter with the solutions to TODOs 1…k filled in, so the replay
-- shows the code actually growing. Each patch swaps one exact piece of text.

create table seed.patch (k int, ord int, path text, find text, repl text);
insert into seed.patch values
(1, 1, 'src/App.vue', $p$onMounted(async () => {
})$p$, $p$onMounted(async () => {
  const { data } = await axios.get('/api/categories')
  categories.value = data
  selectedCategory.value = data[0]
  await loadItems()
})$p$),

(2, 1, 'src/App.vue', $p$async function loadItems() {
}$p$, $p$async function loadItems() {
  const { data } = await axios.get('/api/items', { params: { category: selectedCategory.value } })
  items.value = data
}$p$),

(3, 1, 'src/App.vue', $p$import axios from 'axios'
$p$, $p$import axios from 'axios'
import ItemCard from './components/ItemCard.vue'
$p$),
(3, 2, 'src/App.vue', $p$      <!-- Then import ItemCard above, show it here, and listen for its add-to-cart event. -->$p$,
$p$      <!-- Then import ItemCard above, show it here, and listen for its add-to-cart event. -->
      <ItemCard :items="items" @add-to-cart="addToCart" />$p$),
(3, 3, 'src/components/ItemCard.vue', $p$// Declare the prop with defineProps. Each item looks like { id, name, price, emoji }.
$p$, $p$// Declare the prop with defineProps. Each item looks like { id, name, price, emoji }.
const props = defineProps({ items: { type: Array, required: true } })
$p$),

-- the trouble step: inside <script setup> it's props.items; the template can say items
(4, 1, 'src/components/ItemCard.vue', $p$function addToCart(id) {
}$p$, $p$const emit = defineEmits(['add-to-cart'])

function addToCart(id) {
  const item = props.items.find((i) => i.id === id)
  emit('add-to-cart', item)
}$p$),

(5, 1, 'src/App.vue', $p$function addToCart(item) {
}$p$, $p$function addToCart(item) {
  const line = cart.value.find((l) => l.id === item.id)
  if (line) line.quantity++
  else cart.value.push({ ...item, quantity: 1 })
}$p$),

(6, 1, 'src/App.vue', $p$import { ref, onMounted } from 'vue'$p$, $p$import { ref, computed, onMounted } from 'vue'$p$),
(6, 2, 'src/App.vue', $p$// TODO 6: Show the cart total with a computed property
$p$, $p$// TODO 6: Show the cart total with a computed property
const total = computed(() => cart.value.reduce((sum, l) => sum + l.price * l.quantity, 0))
$p$),
(6, 3, 'src/App.vue', $p$      <div v-if="receipt" class="receipt">$p$, $p$      <p><strong>Total: ${{ total.toFixed(2) }}</strong></p>

      <div v-if="receipt" class="receipt">$p$),

(7, 1, 'src/App.vue', $p$import { ref, computed, onMounted } from 'vue'$p$, $p$import { ref, computed, watch, onMounted } from 'vue'$p$),
(7, 2, 'src/App.vue', $p$// TODO 7: Save the cart to localStorage and load it on start
$p$, $p$// TODO 7: Save the cart to localStorage and load it on start
cart.value = JSON.parse(localStorage.getItem('cart') ?? '[]')
watch(cart, (value) => localStorage.setItem('cart', JSON.stringify(value)), { deep: true })
$p$),

(8, 1, 'src/App.vue', $p$// Reset empties the cart. Checkout sends { cart } and shows the receipt that comes back.
$p$, $p$// Reset empties the cart. Checkout sends { cart } and shows the receipt that comes back.
function reset() {
  cart.value = []
  receipt.value = null
}

async function checkout() {
  const { data } = await axios.post('/api/checkout', { cart: cart.value })
  receipt.value = data
  cart.value = []
}
$p$),
(8, 2, 'src/App.vue', $p$      <div v-if="receipt" class="receipt">$p$, $p$      <button @click="reset">Reset</button>
      <button @click="checkout" :disabled="cart.length === 0">Checkout</button>

      <div v-if="receipt" class="receipt">$p$),
(8, 3, 'server/api.js', $p$app.post('/api/checkout', (req, res) => {
  res.status(501).json({ error: 'Checkout is not built yet' })
})$p$, $p$app.post('/api/checkout', (req, res) => {
  const cart = req.body.cart ?? []
  const total = cart.reduce((sum, line) => sum + line.price * line.quantity, 0)
  res.json({ receiptId: Date.now().toString(36), cart, total })
})$p$);

-- Swap one piece of text in one file. Raises if the text isn't there, so a change to the
-- starter project breaks the seed loudly instead of seeding the wrong code.
create function seed.patched(f jsonb, p_path text, p_find text, p_repl text) returns jsonb
language plpgsql as $$
begin
    if not exists (
        select 1 from jsonb_array_elements(f) e
         where e->>'path' = p_path and position(p_find in e->>'content') > 0
    ) then
        raise exception 'seed: text not found in %: %', p_path, left(p_find, 60);
    end if;
    return (
        select jsonb_agg(
                   case when e->>'path' = p_path
                        then jsonb_set(e, '{content}', to_jsonb(replace(e->>'content', p_find, p_repl)))
                        else e end
                   order by i)
          from jsonb_array_elements(f) with ordinality x(e, i)
    );
end $$;

-- The project with TODOs 1…upto solved.
create function seed.files_at(upto int) returns jsonb language plpgsql as $$
declare
    f jsonb := (select files from seed.starter);
    p record;
begin
    for p in select * from seed.patch where k <= upto order by k, ord loop
        f := seed.patched(f, p.path, p.find, p.repl);
    end loop;
    return f;
end $$;

-- What half the class wrote at step 4: items instead of props.items
create function seed.step4_bug() returns jsonb language sql as $$
    select seed.patched(seed.files_at(4), 'src/components/ItemCard.vue', 'props.items.find', 'items.find')
$$;


-- 6. Sessions ------------------------------------

insert into public.sessions (id, lesson_id, course_id, started_by, join_code, status,
                             current_step_id, settings, announcement, started_at, ended_at) values
    -- the past session everything else hangs off: replay, report, help history, notes
    ('00000000-0000-0000-0004-000000000001', '00000000-0000-0000-0002-000000000001',
     '00000000-0000-0000-0001-000000000001', seed.u(1), 'MNCART', 'ended', seed.step(1, 8),
     default, null, '2026-10-12 14:00+08', '2026-10-12 15:35+08'),
    -- same lesson, last term (report only)
    ('00000000-0000-0000-0004-000000000002', '00000000-0000-0000-0002-000000000002',
     '00000000-0000-0000-0001-000000000002', seed.u(1), 'MNCT25', 'ended', null,
     default, null, '2025-10-13 14:00+08', '2025-10-13 15:35+08'),
    -- Prof Tan's run (report only)
    ('00000000-0000-0000-0004-000000000003', '00000000-0000-0000-0002-000000000003',
     '00000000-0000-0000-0001-000000000003', seed.u(16), 'TANMCT', 'ended', null,
     default, null, '2026-10-13 10:00+08', '2026-10-13 11:35+08'),
    -- LIVE, for building the dashboard and workspace before start_session exists.
    -- idleAfterSec is 3600 (not 180) so the tiles stay un-idle for an hour after a reset.
    ('00000000-0000-0000-0004-000000000004', '00000000-0000-0000-0002-000000000001',
     '00000000-0000-0000-0001-000000000001', seed.u(1), 'CART42', 'live', seed.step(1, 3),
     '{"allowCatchUp": true, "hintsEnabled": false, "idleAfterSec": 3600}',
     jsonb_build_object('text', 'Step 3 is where build errors show up — check your import paths.',
                        'at', now() - interval '5 minutes'),
     now() - interval '25 minutes', null);

insert into public.checkpoints (session_id, step_id, seq, files, note, created_by, created_at)
select '00000000-0000-0000-0004-000000000001', seed.step(1, k), k, seed.files_at(k), note, seed.u(1),
       timestamptz '2026-10-12 14:00+08' + make_interval(mins => k * 10)
  from (values
      (1, 'Categories load on mount'),
      (2, 'Items load for the selected category'),
      (3, 'ItemCard with an items prop'),
      (4, 'Emit add-to-cart — props.items in the script, not items!'),
      (5, 'Add to cart, or bump the quantity'),
      (6, 'Computed total'),
      (7, 'Cart survives a refresh'),
      (8, 'Reset and Checkout')
  ) c(k, note);

insert into public.checkpoints (session_id, step_id, seq, files, created_by, created_at)
select '00000000-0000-0000-0004-000000000004', seed.step(1, k), k, seed.files_at(k), seed.u(1),
       now() - make_interval(mins => 25 - k * 6)
  from generate_series(1, 3) k;


-- 7. The past session, minute by minute ------------------------------------
-- 11 students. Checkpoint k lands at 14:00 + 10k min; each student marks it done `pace`
-- minutes later. Six hit `items is not defined` at step 4; three never finish step 7.

create table seed.past (n int, join_min int, pace int, err4 boolean, behind boolean, catchup boolean);
insert into seed.past values
    ( 4, 1, 3, false, false, false),   -- Alex
    ( 5, 1, 5, true,  false, false),   -- Bea
    ( 6, 2, 4, false, false, false),   -- Chen
    ( 7, 2, 6, true,  false, false),   -- Dana
    ( 8, 3, 5, false, true,  true),    -- Eli
    ( 9, 1, 4, true,  false, false),   -- Faye
    (10, 3, 7, true,  true,  false),   -- Gus
    (11, 2, 3, true,  false, false),   -- Hana
    (12, 3, 6, false, true,  true),    -- Ivan
    (13, 1, 5, true,  false, false),   -- Jae
    (14, 2, 2, false, false, false);   -- Kim

-- status_history, written exactly as the triggers would have: a row each time the derived
-- state changes (05 §4). Written directly because the triggers stamp now(), not 14:23.
do $$
declare
    sid  uuid := '00000000-0000-0000-0004-000000000001';
    t0   timestamptz := '2026-10-12 14:00+08';
    s    record;
    k    int;
    tk   timestamptz;
begin
    for s in select * from seed.past order by n loop
        insert into public.status_history (session_id, student_id, state, step_order, at)
        values (sid, seed.u(s.n), 'in_progress', 0, t0 + make_interval(mins => s.join_min));

        for k in 1..8 loop
            tk := t0 + make_interval(mins => k * 10);

            if s.behind and k > 6 then
                -- never marks step 7 done: checkpoint 7 makes them in_progress, checkpoint 8 behind
                insert into public.status_history (session_id, student_id, state, step_order, at)
                values (sid, seed.u(s.n), case k when 7 then 'in_progress' else 'behind' end, 6, tk);
                continue;
            end if;

            -- the checkpoint moves the target: done on k-1 becomes in_progress on k
            if k > 1 then
                insert into public.status_history (session_id, student_id, state, step_order, at)
                values (sid, seed.u(s.n), 'in_progress', k - 1, tk);
            end if;

            if s.err4 and k = 4 then
                insert into public.status_history (session_id, student_id, state, step_order, error_key, at)
                values (sid, seed.u(s.n), 'error', 3, 'ReferenceError: items is not defined',
                        tk + interval '2 minutes');
            end if;

            insert into public.status_history (session_id, student_id, state, step_order, at)
            values (sid, seed.u(s.n), 'done', k,
                    tk + make_interval(mins => s.pace + case when s.err4 and k = 4 then 2 else 0 end));
        end loop;
    end loop;
end $$;

-- Each student's final row. Its derived state equals their last history row, so the
-- status_history trigger adds nothing.
insert into public.student_status (session_id, student_id, done_step_order, catch_ups, last_seen_at, joined_at)
select '00000000-0000-0000-0004-000000000001', seed.u(n),
       case when behind then 6 else 8 end,
       case when catchup then 1 else 0 end,
       '2026-10-12 15:34+08',
       timestamptz '2026-10-12 14:00+08' + make_interval(mins => join_min)
  from seed.past;

-- Snapshots: everyone's autosave, plus Eli's and Ivan's code just before they caught up.
insert into public.snapshots (session_id, student_id, step_id, reason, files, created_at, updated_at)
select '00000000-0000-0000-0004-000000000001', seed.u(n),
       seed.step(1, case when behind then 7 else 8 end), 'autosave',
       seed.files_at(case when behind then 6 else 8 end),
       timestamptz '2026-10-12 14:00+08' + make_interval(mins => join_min),
       '2026-10-12 15:34+08' -- last saved just before the class ended
  from seed.past;

insert into public.snapshots (session_id, student_id, step_id, reason, files, created_at, updated_at)
select '00000000-0000-0000-0004-000000000001', seed.u(n), seed.step(1, 7), 'before_catchup',
       seed.files_at(6), '2026-10-12 15:18+08', '2026-10-12 15:18+08'
  from seed.past where catchup;

-- Five help requests: 2 passed checks, 2 replied helps, 1 resolved in person.
-- Each carries its own help_request snapshot of the code at the moment they asked.
create function seed.help(
    p_student int, p_step int, p_type text, p_files jsonb, p_message text, p_status text,
    p_staff int, p_reply text, p_at timestamptz, p_seat text default null
) returns void language plpgsql as $$
declare
    sid  uuid := '00000000-0000-0000-0004-000000000001';
    snap uuid;
begin
    insert into public.snapshots (session_id, student_id, step_id, reason, files, created_at, updated_at)
    values (sid, seed.u(p_student), seed.step(1, p_step), 'help_request', p_files, p_at, p_at)
    returning id into snap;

    insert into public.help_requests (
        session_id, student_id, step_id, type, snapshot_id, message, in_person, seat, status,
        claimed_by, thread, telegram_notified_at, created_at, updated_at
    ) values (
        sid, seed.u(p_student), seed.step(1, p_step), p_type, snap, p_message, p_seat is not null, p_seat,
        p_status, seed.u(p_staff),
        case when p_reply is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object(
            'role', 'staff', 'author_id', seed.u(p_staff), 'body', p_reply,
            'at', p_at + interval '3 minutes')) end,
        case when p_seat is not null then p_at end,
        p_at, p_at + interval '3 minutes'
    );
end $$;

select seed.help(4, 2, 'check', seed.files_at(2), null, 'passed', 2,
                 'Looks good — nice use of params.', '2026-10-12 14:22+08');
select seed.help(6, 5, 'check', seed.files_at(5), null, 'passed', 3,
                 'Yes — and the quantity bump is exactly right.', '2026-10-12 14:53+08');
select seed.help(5, 4, 'help', seed.step4_bug(), 'items is not defined in ItemCard?', 'replied', 2,
                 'Inside <script setup> the prop is props.items. The template can say items; the script can''t.',
                 '2026-10-12 14:43+08');
select seed.help(11, 4, 'help', seed.step4_bug(), 'My add to cart button crashes', 'replied', 1,
                 'Same one as half the room: props.items, not items. Check line 11 of ItemCard.vue.',
                 '2026-10-12 14:44+08');
select seed.help(10, 7, 'help', seed.files_at(6), 'Not sure where the watch goes', 'resolved', 3,
                 null, '2026-10-12 15:15+08', 'C14');

-- Alex's notes and bookmarks on steps 4 and 7, anchored to those checkpoints.
insert into public.notes (user_id, session_id, checkpoint_id, kind, body, created_at, updated_at)
select seed.u(4), c.session_id, c.id, n.kind, n.body, c.created_at + interval '4 minutes', c.created_at + interval '4 minutes'
  from (values
      (4, 'note', 'props.items in the script, items in the template — that''s why ItemCard crashed for half the class.'),
      (4, 'bookmark', null),
      (7, 'note', 'watch(cart, …, { deep: true }) — without deep it only fires when the whole array is replaced.'),
      (7, 'bookmark', null)
  ) n(seq, kind, body)
  join public.checkpoints c on c.session_id = '00000000-0000-0000-0004-000000000001' and c.seq = n.seq;

-- "Slow down" over the session: three at once during step 4, three again near the end.
insert into public.slow_down_events (session_id, delta, at)
select '00000000-0000-0000-0004-000000000001', delta, timestamptz '2026-10-12 14:00+08' + make_interval(mins => m)
  from (values (43, 1), (44, 1), (45, 1), (47, -1), (48, -1), (49, -1),
               (74, 1), (75, 1), (76, 1), (88, -1), (89, -1), (90, -1)) e(m, delta)
 order by m;


-- 8. Reports ------------------------------------
-- Literal counts in the shape buildReport must produce (05 §10). seed.test.js checks the
-- past session's numbers against its history. Replace with buildReport's output once
-- shared/report-builder.js exists.
--
-- steps[]: { order, stepId, title, reachedDone, dropOff, errorStudents, peakBehind,
--            medianMinutesToDone, catchUps, helpRequests, trouble }
--   trouble = (0.4 × errorStudents + 0.3 × dropOff + 0.2 × catchUps + 0.1 × helpRequests) / joined

-- the past session (MNCART): these numbers match its history above — 6 errors at step 4,
-- 3 never finish step 7, Eli and Ivan's two catch-ups, peak of 3 asking to slow down at once
insert into public.session_reports (session_id, course_id, lesson_id, attendance, steps, top_errors, slow_down_peak, generated_at)
values (
    '00000000-0000-0000-0004-000000000001', '00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0002-000000000001',
    '{"joined": 11, "enrolled": 11}',
    $r$[
        { "order": 1, "stepId": "00000000-0000-0000-0003-000000001001", "title": "Create the Vue app with a list of categories", "reachedDone": 11, "dropOff": 0, "errorStudents": 0, "peakBehind": 0, "medianMinutesToDone": 15.0, "catchUps": 0, "helpRequests": 0, "trouble": 0.000 },
        { "order": 2, "stepId": "00000000-0000-0000-0003-000000001002", "title": "Fetch items for the selected category with axios", "reachedDone": 11, "dropOff": 0, "errorStudents": 0, "peakBehind": 0, "medianMinutesToDone": 15.0, "catchUps": 0, "helpRequests": 1, "trouble": 0.009 },
        { "order": 3, "stepId": "00000000-0000-0000-0003-000000001003", "title": "Create the ItemCard component with an items prop", "reachedDone": 11, "dropOff": 0, "errorStudents": 0, "peakBehind": 0, "medianMinutesToDone": 15.0, "catchUps": 0, "helpRequests": 0, "trouble": 0.000 },
        { "order": 4, "stepId": "00000000-0000-0000-0003-000000001004", "title": "Emit add-to-cart from ItemCard", "reachedDone": 11, "dropOff": 0, "errorStudents": 6, "peakBehind": 0, "medianMinutesToDone": 16.0, "catchUps": 0, "helpRequests": 2, "trouble": 0.236 },
        { "order": 5, "stepId": "00000000-0000-0000-0003-000000001005", "title": "Add the item to the cart in the parent (increase quantity if it's already there)", "reachedDone": 11, "dropOff": 0, "errorStudents": 0, "peakBehind": 0, "medianMinutesToDone": 15.0, "catchUps": 0, "helpRequests": 1, "trouble": 0.009 },
        { "order": 6, "stepId": "00000000-0000-0000-0003-000000001006", "title": "Show the cart total with a computed property", "reachedDone": 11, "dropOff": 0, "errorStudents": 0, "peakBehind": 0, "medianMinutesToDone": 15.0, "catchUps": 0, "helpRequests": 0, "trouble": 0.000 },
        { "order": 7, "stepId": "00000000-0000-0000-0003-000000001007", "title": "Save the cart to localStorage and load it on start", "reachedDone": 8, "dropOff": 3, "errorStudents": 0, "peakBehind": 0, "medianMinutesToDone": 14.0, "catchUps": 2, "helpRequests": 1, "trouble": 0.127 },
        { "order": 8, "stepId": "00000000-0000-0000-0003-000000001008", "title": "Add Reset and Checkout buttons (POST /api/checkout)", "reachedDone": 8, "dropOff": 0, "errorStudents": 0, "peakBehind": 3, "medianMinutesToDone": 14.0, "catchUps": 0, "helpRequests": 0, "trouble": 0.000 }
    ]$r$,
    $r$[{"key": "ReferenceError: items is not defined", "students": 6, "stepOrder": 4}]$r$,
    3, '2026-10-12 15:36+08'
);

-- last term (MNCT25): step 4 is the top trouble step again, so it shows as recurring
insert into public.session_reports (session_id, course_id, lesson_id, attendance, steps, top_errors, slow_down_peak, generated_at)
values (
    '00000000-0000-0000-0004-000000000002', '00000000-0000-0000-0001-000000000002', '00000000-0000-0000-0002-000000000002',
    '{"joined": 24, "enrolled": 27}',
    $r$[
        { "order": 1, "stepId": "00000000-0000-0000-0003-000000002001", "title": "Create the Vue app with a list of categories", "reachedDone": 24, "dropOff": 0, "errorStudents": 0, "peakBehind": 0, "medianMinutesToDone": null, "catchUps": 0, "helpRequests": 0, "trouble": 0.000 },
        { "order": 2, "stepId": "00000000-0000-0000-0003-000000002002", "title": "Fetch items for the selected category with axios", "reachedDone": 24, "dropOff": 0, "errorStudents": 1, "peakBehind": 0, "medianMinutesToDone": null, "catchUps": 0, "helpRequests": 1, "trouble": 0.021 },
        { "order": 3, "stepId": "00000000-0000-0000-0003-000000002003", "title": "Create the ItemCard component with an items prop", "reachedDone": 23, "dropOff": 1, "errorStudents": 2, "peakBehind": 0, "medianMinutesToDone": null, "catchUps": 0, "helpRequests": 1, "trouble": 0.050 },
        { "order": 4, "stepId": "00000000-0000-0000-0003-000000002004", "title": "Emit add-to-cart from ItemCard", "reachedDone": 19, "dropOff": 4, "errorStudents": 9, "peakBehind": 0, "medianMinutesToDone": null, "catchUps": 0, "helpRequests": 5, "trouble": 0.221 },
        { "order": 5, "stepId": "00000000-0000-0000-0003-000000002005", "title": "Add the item to the cart in the parent (increase quantity if it's already there)", "reachedDone": 19, "dropOff": 0, "errorStudents": 1, "peakBehind": 0, "medianMinutesToDone": null, "catchUps": 0, "helpRequests": 0, "trouble": 0.017 },
        { "order": 6, "stepId": "00000000-0000-0000-0003-000000002006", "title": "Show the cart total with a computed property", "reachedDone": 18, "dropOff": 1, "errorStudents": 0, "peakBehind": 0, "medianMinutesToDone": null, "catchUps": 0, "helpRequests": 1, "trouble": 0.017 },
        { "order": 7, "stepId": "00000000-0000-0000-0003-000000002007", "title": "Save the cart to localStorage and load it on start", "reachedDone": 17, "dropOff": 1, "errorStudents": 2, "peakBehind": 0, "medianMinutesToDone": null, "catchUps": 0, "helpRequests": 1, "trouble": 0.050 },
        { "order": 8, "stepId": "00000000-0000-0000-0003-000000002008", "title": "Add Reset and Checkout buttons (POST /api/checkout)", "reachedDone": 17, "dropOff": 0, "errorStudents": 0, "peakBehind": 0, "medianMinutesToDone": null, "catchUps": 0, "helpRequests": 0, "trouble": 0.000 }
    ]$r$,
    $r$[{"key": "ReferenceError: items is not defined", "students": 9, "stepOrder": 4}]$r$,
    5, '2025-10-13 15:36+08'
);

-- Prof Tan's run (TANMCT): step 2 instead — must never show up in Prof Lee's trends
insert into public.session_reports (session_id, course_id, lesson_id, attendance, steps, top_errors, slow_down_peak, generated_at)
values (
    '00000000-0000-0000-0004-000000000003', '00000000-0000-0000-0001-000000000003', '00000000-0000-0000-0002-000000000003',
    '{"joined": 30, "enrolled": 32}',
    $r$[
        { "order": 1, "stepId": "00000000-0000-0000-0003-000000003001", "title": "Create the Vue app with a list of categories", "reachedDone": 29, "dropOff": 1, "errorStudents": 1, "peakBehind": 0, "medianMinutesToDone": null, "catchUps": 0, "helpRequests": 1, "trouble": 0.027 },
        { "order": 2, "stepId": "00000000-0000-0000-0003-000000003002", "title": "Fetch items for the selected category with axios", "reachedDone": 24, "dropOff": 5, "errorStudents": 8, "peakBehind": 0, "medianMinutesToDone": null, "catchUps": 0, "helpRequests": 4, "trouble": 0.170 },
        { "order": 3, "stepId": "00000000-0000-0000-0003-000000003003", "title": "Create the ItemCard component with an items prop", "reachedDone": 23, "dropOff": 1, "errorStudents": 2, "peakBehind": 0, "medianMinutesToDone": null, "catchUps": 0, "helpRequests": 1, "trouble": 0.040 },
        { "order": 4, "stepId": "00000000-0000-0000-0003-000000003004", "title": "Emit add-to-cart from ItemCard", "reachedDone": 23, "dropOff": 0, "errorStudents": 2, "peakBehind": 0, "medianMinutesToDone": null, "catchUps": 0, "helpRequests": 1, "trouble": 0.030 },
        { "order": 5, "stepId": "00000000-0000-0000-0003-000000003005", "title": "Add the item to the cart in the parent (increase quantity if it's already there)", "reachedDone": 22, "dropOff": 1, "errorStudents": 1, "peakBehind": 0, "medianMinutesToDone": null, "catchUps": 0, "helpRequests": 0, "trouble": 0.023 },
        { "order": 6, "stepId": "00000000-0000-0000-0003-000000003006", "title": "Show the cart total with a computed property", "reachedDone": 22, "dropOff": 0, "errorStudents": 0, "peakBehind": 0, "medianMinutesToDone": null, "catchUps": 0, "helpRequests": 0, "trouble": 0.000 },
        { "order": 7, "stepId": "00000000-0000-0000-0003-000000003007", "title": "Save the cart to localStorage and load it on start", "reachedDone": 21, "dropOff": 1, "errorStudents": 1, "peakBehind": 0, "medianMinutesToDone": null, "catchUps": 0, "helpRequests": 1, "trouble": 0.027 },
        { "order": 8, "stepId": "00000000-0000-0000-0003-000000003008", "title": "Add Reset and Checkout buttons (POST /api/checkout)", "reachedDone": 21, "dropOff": 0, "errorStudents": 0, "peakBehind": 0, "medianMinutesToDone": null, "catchUps": 0, "helpRequests": 0, "trouble": 0.000 }
    ]$r$,
    $r$[{"key": "TypeError: Cannot read properties of undefined (reading 'data')", "students": 8, "stepOrder": 2}]$r$,
    4, '2026-10-13 11:36+08'
);


-- 9. The live session (CART42) ------------------------------------
-- Five students mid-class, one of each tile state, so Evan's dashboard and Karin's queue
-- have something to render. Written through the triggers, so history is stamped now().
--   Alex done · Eli done · Chen in_progress · Bea error (build) · Dana behind
-- Faye and the others haven't joined: the "absent" side of attendance.

insert into public.student_status (session_id, student_id, done_step_order, error, last_seen_at, joined_at)
select '00000000-0000-0000-0004-000000000004', seed.u(n), done, err, now(), now() - interval '20 minutes'
  from (values
      (4, 3, null::jsonb),
      (8, 3, null),
      (6, 2, null),
      (5, 2, jsonb_build_object(
          'source', 'build', 'name', 'Error',
          'message', '[plugin:vite:import-analysis] Failed to resolve import "./components/Itemcard.vue" from "src/App.vue". Does the file exist?',
          'file', 'src/App.vue', 'line', 4,
          'key', 'build: Failed to resolve import', 'shapeKey', 'build: Failed to resolve import <path>',
          'at', now() - interval '2 minutes')),
      (7, 1, null)
  ) s(n, done, err);

insert into public.snapshots (session_id, student_id, step_id, reason, files)
select '00000000-0000-0000-0004-000000000004', seed.u(n), seed.step(1, least(done + 1, 3)), 'autosave',
       case n when 5 then seed.patched(seed.files_at(3), 'src/App.vue', './components/ItemCard.vue', './components/Itemcard.vue')
              else seed.files_at(done) end
  from (values (4, 3), (8, 3), (6, 2), (5, 2), (7, 1)) s(n, done);

-- Bea's open help request, waiting in the queue
with snap as (
    insert into public.snapshots (session_id, student_id, step_id, reason, files)
    values ('00000000-0000-0000-0004-000000000004', seed.u(5), seed.step(1, 3), 'help_request',
            seed.patched(seed.files_at(3), 'src/App.vue', './components/ItemCard.vue', './components/Itemcard.vue'))
    returning id
)
insert into public.help_requests (session_id, student_id, step_id, type, snapshot_id, message, created_at)
select '00000000-0000-0000-0004-000000000004', seed.u(5), seed.step(1, 3), 'help', snap.id,
       'Vite says it can''t find ItemCard?', now() - interval '90 seconds'
  from snap;

-- Chen has tapped "Slow down" (staff see slow_down_count = 1, never who)
insert into public.slow_down_flags (session_id, student_id) values ('00000000-0000-0000-0004-000000000004', seed.u(6));


drop schema seed cascade;
