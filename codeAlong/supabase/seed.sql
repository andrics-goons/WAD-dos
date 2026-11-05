-- supabase/seed.sql — demo data. Runs after the migrations on every `supabase db reset`
-- (pnpm db:reset), so it starts from an empty database every time: no clean-up step.
-- Spec: design-docs/07-seed-and-demo.md
--
-- Every account's password: pass1234
--
-- What's here:
--   29 users: Prof Lee, 2 TAs (Ana, Ben), 25 students, Prof Tan, the admin
--   IS216 G2 (Prof Lee): 23 students, 2 TAs, lessons in Weeks 3–7 plus a "No week" one:
--     · Week 5 · Grade Book — taught 5 Oct (GRADE5): a full replay and report
--     · Week 6 · Mini Cart  — taught 12 Oct (MNCART): a full replay and report,
--                             and LIVE now (CART42) with 21 students mid-class
--     · Week 6 · Cart extras (a second file in Week 6) · Week 4 (ready, never taught)
--     · Week 7 (draft) · Week 3 (archived) · a practice sandbox with no week
--   More of Prof Lee's courses, so Home has more than 3: IS113 G1 (Prof Tan is its TA),
--   IS216 G3, IS442 G1, and last term's IS216 G2 (archived, with a report for trends)
--   Prof Tan's IS216 G1 (with a report Prof Lee must never see)
--
-- Fixed ids, grouped by table, so every insert can point at earlier rows:
--   users        00000000-0000-0000-0000-0000000000NN   seed.u(NN)  (NN = the # in 07's user table)
--   courses      00000000-0000-0000-0001-0000000000NN   seed.c(NN)
--   lessons      00000000-0000-0000-0002-0000000000NN   seed.l(NN)
--   sessions     00000000-0000-0000-0004-0000000000NN   seed.s(NN)
-- The ids, emails and join codes from the first seed are unchanged (the E2E tests use them).


-- Scratch space for building the data; dropped at the end.
create schema seed;

create function seed.u(p int) returns uuid language sql immutable as $$
    select ('00000000-0000-0000-0000-' || lpad(p::text, 12, '0'))::uuid
$$;
create function seed.c(p int) returns uuid language sql immutable as $$
    select ('00000000-0000-0000-0001-' || lpad(p::text, 12, '0'))::uuid
$$;
create function seed.l(p int) returns uuid language sql immutable as $$
    select ('00000000-0000-0000-0002-' || lpad(p::text, 12, '0'))::uuid
$$;
create function seed.s(p int) returns uuid language sql immutable as $$
    select ('00000000-0000-0000-0004-' || lpad(p::text, 12, '0'))::uuid
$$;


-- 1. Users ------------------------------------
-- Passwords are hashed by crypt(), the same bcrypt Supabase Auth uses — never by us.
-- on_auth_user_created creates each profiles row (as 'student'); step 2 sets the roles.

create table seed.users (n int primary key, name text, email text, role text);
insert into seed.users (n, name, email, role) values
    ( 1, 'Prof Lee',     'prof@codealong.test',     'prof'),
    ( 2, 'Ana Lim',      'ta.ana@codealong.test',   'ta'),
    ( 3, 'Ben Ong',      'ta.ben@codealong.test',   'ta'),
    ( 4, 'Alex Tan',     'alex@codealong.test',     'student'),
    ( 5, 'Bea Koh',      'bea@codealong.test',      'student'),
    ( 6, 'Chen Wei',     'chen@codealong.test',     'student'),
    ( 7, 'Dana',         'dana@codealong.test',     'student'),
    ( 8, 'Eli',          'eli@codealong.test',      'student'),
    ( 9, 'Faye',         'faye@codealong.test',     'student'),
    (10, 'Gus',          'gus@codealong.test',      'student'),
    (11, 'Hana',         'hana@codealong.test',     'student'),
    (12, 'Ivan',         'ivan@codealong.test',     'student'),
    (13, 'Jae',          'jae@codealong.test',      'student'),
    (14, 'Kim',          'kim@codealong.test',      'student'),
    (15, 'Zoe Ng',       'zoe@codealong.test',      'student'),   -- NOT enrolled anywhere
    (16, 'Prof Tan',     'prof.tan@codealong.test', 'prof'),
    (17, 'Ada Admin',    'admin@codealong.test',    'admin'),     -- the one admin
    (18, 'Lucas Goh',    'lucas@codealong.test',    'student'),
    (19, 'Mei Ling',     'mei@codealong.test',      'student'),
    (20, 'Nadia Rahman', 'nadia@codealong.test',    'student'),
    (21, 'Omar Aziz',    'omar@codealong.test',     'student'),
    (22, 'Priya Nair',   'priya@codealong.test',    'student'),
    (23, 'Quinn Teo',    'quinn@codealong.test',    'student'),
    (24, 'Rachel Lim',   'rachel@codealong.test',   'student'),
    (25, 'Sam Lee',      'sam@codealong.test',      'student'),
    (26, 'Tara Wong',    'tara@codealong.test',     'student'),
    (27, 'Uma Das',      'uma@codealong.test',      'student'),
    (28, 'Victor Chua',  'victor@codealong.test',   'student'),
    (29, 'Wen Hui',      'wenhui@codealong.test',   'student');

-- The empty-string token columns matter: Supabase Auth fails to log in a user whose
-- tokens are NULL ("converting NULL to string").
insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
)
select '00000000-0000-0000-0000-000000000000', seed.u(n), 'authenticated', 'authenticated', email,
       extensions.crypt('pass1234', extensions.gen_salt('bf')), now(),
       '{"provider": "email", "providers": ["email"]}', jsonb_build_object('name', name),
       now(), now(), '', '', '', ''
  from seed.users;

-- the email identity is what email + password sign-in looks up
insert into auth.identities (user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select seed.u(n), seed.u(n)::text, 'email',
       jsonb_build_object('sub', seed.u(n)::text, 'email', email, 'email_verified', true),
       now(), now(), now()
  from seed.users;


-- 2. Roles ------------------------------------
-- Run as the database owner, so the "can't change your own role" policy doesn't apply.
-- In the app, ta comes from add_course_staff and admin only from here or another admin.
-- (A TA's profile role is 'ta' here only so the Profile page says TA for Ana and Ben; Prof Tan
-- is a prof who is also a TA in one of Prof Lee's courses.)

update public.profiles p set role = u.role from seed.users u where p.id = seed.u(u.n);


-- 3. Courses, staff, students ------------------------------------
-- created_at matters: Home lists courses newest first, three of them. IS216 G2 is the oldest
-- of Prof Lee's, so it only stays on Home because a class is live in it (it goes first).

insert into public.courses (id, code, title, term, section, owner_id, enrol_code, archived, created_at) values
    (seed.c(1), 'IS216', 'Web Application Development II', 'AY2026/27 T1', 'G2', seed.u(1),  'WAD2G2', false, '2026-08-01 09:00+08'),
    -- last term, archived: its report gives "recurring trouble across terms" something to find
    (seed.c(2), 'IS216', 'Web Application Development II', 'AY2025/26 T1', 'G2', seed.u(1),  'WADG25', true,  '2025-08-01 09:00+08'),
    -- Prof Tan's: Prof Lee must never see it, and his trends must never count it
    (seed.c(3), 'IS216', 'Web Application Development II', 'AY2026/27 T1', 'G1', seed.u(16), 'TANWAD', false, '2026-08-02 09:00+08'),
    -- more of Prof Lee's, so Home shows "See all (n)"
    (seed.c(4), 'IS113', 'Web Application Development I',  'AY2026/27 T1', 'G1', seed.u(1),  'WAD1G1', false, '2026-08-05 09:00+08'),
    (seed.c(5), 'IS216', 'Web Application Development II', 'AY2026/27 T1', 'G3', seed.u(1),  'WAD2G3', false, '2026-08-06 09:00+08'),
    (seed.c(6), 'IS442', 'Object-Oriented Programming',    'AY2026/27 T1', 'G1', seed.u(1),  'OOP442', false, '2026-08-07 09:00+08');

insert into public.course_staff (course_id, user_id, role) values
    (seed.c(1), seed.u(1),  'prof'),
    (seed.c(1), seed.u(2),  'ta'),
    (seed.c(1), seed.u(3),  'ta'),
    (seed.c(2), seed.u(1),  'prof'),
    (seed.c(2), seed.u(2),  'ta'),
    (seed.c(3), seed.u(16), 'prof'),
    (seed.c(4), seed.u(1),  'prof'),
    (seed.c(4), seed.u(16), 'ta'),     -- a prof can be a TA in someone else's course
    (seed.c(5), seed.u(1),  'prof'),
    (seed.c(5), seed.u(3),  'ta'),
    (seed.c(6), seed.u(1),  'prof');

-- IS216 G2: Alex … Kim (4–14) and Lucas … Wen Hui (18–29), 23 in all. Zoe (15) is left out.
insert into public.course_students (course_id, user_id, enrolled_at)
select seed.c(1), seed.u(n), '2026-08-10 10:00+08'
  from generate_series(4, 29) n where n not between 15 and 17;
-- IS113 G1 and IS216 G3 have a few each; IS442 has nobody yet
insert into public.course_students (course_id, user_id) values
    (seed.c(4), seed.u(4)), (seed.c(4), seed.u(5)), (seed.c(4), seed.u(18)), (seed.c(4), seed.u(19)),
    (seed.c(5), seed.u(25)), (seed.c(5), seed.u(26)), (seed.c(5), seed.u(27));


-- 4. The lesson projects ------------------------------------
-- Two real projects the workspace boots and runs. Mini Cart's starter files are copied from
-- tests/fixtures/miniCartSeed.js; Grade Book shares its Vite setup and ca-probe.js.
-- If a project changes, re-copy it — the patches in step 5 raise an error if their text is gone.

create table seed.project (name text primary key, files jsonb);
insert into seed.project values ('minicart', $mc$[
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
    "content": "import { defineConfig } from 'vite'\nimport vue from '@vitejs/plugin-vue'\n\n// CodeAlong: prints errors from your running app in the terminal, so your workspace can see them.\n// src/ca-probe.js sends them here. You don't need to edit this.\nfunction caErrors() {\n  return {\n    name: 'ca-errors',\n    configureServer(server) {\n      // server.hot is Vite's connection to every open copy of your app\n      server.hot.on('ca:error', (raw) => {\n        // one line of JSON, so CodeAlong can read it back\n        console.log('ca-error ' + JSON.stringify(raw))\n      })\n    },\n  }\n}\n\n// https://vite.dev/config/\nexport default defineConfig({\n  plugins: [vue(), caErrors()],\n  server: {\n    // Send every /api request to the Express server in server/api.js\n    proxy: {\n      '/api': 'http://localhost:3001',\n    },\n  },\n})\n"
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
    "content": "// CodeAlong runtime probe: reports errors in your app to your CodeAlong workspace.\n// You don't need to edit this file.\n//\n// Each error goes to the Vite dev server, which prints it in the terminal for CodeAlong to read\n// (the ca-errors plugin in vite.config.js). Works in the preview and when it's popped out.\n\n// sends one error to the Vite dev server over its hot-reload connection.\n// import.meta.hot only exists while running under pnpm dev, so ?. skips it otherwise\nfunction sendError(raw) {\n  import.meta.hot?.send('ca:error', raw)\n}\n\n// errors thrown while the app runs, e.g. TypeError, ReferenceError\nwindow.addEventListener('error', (event) => {\n  sendError({\n    name: event.error?.name,\n    // event.message on its own starts with \"Uncaught \", the error object's message doesn't\n    message: event.error?.message ?? event.message,\n    filename: event.filename,\n    lineno: event.lineno,\n  })\n})\n\n// promises nobody caught, e.g. a failed await axios.get(...)\nwindow.addEventListener('unhandledrejection', (event) => {\n  const err = event.reason\n  // the browser doesn't say where a promise failed, so filename and lineno stay null\n  sendError({ name: err?.name, message: err?.message ?? String(err), filename: null, lineno: null })\n})\n"
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
insert into seed.project values ('gradebook', $gb$[
  {
    "path": "index.html",
    "language": "html",
    "content": "<!DOCTYPE html>\n<html lang=\"en\">\n  <head>\n    <meta charset=\"UTF-8\" />\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />\n    <link rel=\"icon\" href=\"data:,\" />\n    <title>Grade Book</title>\n  </head>\n  <body>\n    <div id=\"app\"></div>\n    <script type=\"module\" src=\"/src/main.js\"></script>\n  </body>\n</html>\n"
  },
  {
    "path": "package.json",
    "language": "json",
    "content": "{\n  \"name\": \"grade-book\",\n  \"version\": \"0.0.0\",\n  \"private\": true,\n  \"type\": \"module\",\n  \"scripts\": {\n    \"dev\": \"vite\",\n    \"build\": \"vite build\"\n  },\n  \"dependencies\": {\n    \"vue\": \"^3.5.44\"\n  },\n  \"devDependencies\": {\n    \"@napi-rs/wasm-runtime\": \"1.2.5\",\n    \"@rolldown/binding-wasm32-wasi\": \"1.2.15\",\n    \"@vitejs/plugin-vue\": \"^6.0.10\",\n    \"vite\": \"^8.1.5\"\n  }\n}\n"
  },
  {
    "path": "vite.config.js",
    "language": "js",
    "content": "import { defineConfig } from 'vite'\nimport vue from '@vitejs/plugin-vue'\n\n// CodeAlong: prints errors from your running app in the terminal, so your workspace can see them.\n// src/ca-probe.js sends them here. You don't need to edit this.\nfunction caErrors() {\n  return {\n    name: 'ca-errors',\n    configureServer(server) {\n      // server.hot is Vite's connection to every open copy of your app\n      server.hot.on('ca:error', (raw) => {\n        // one line of JSON, so CodeAlong can read it back\n        console.log('ca-error ' + JSON.stringify(raw))\n      })\n    },\n  }\n}\n\n// https://vite.dev/config/\nexport default defineConfig({\n  plugins: [vue(), caErrors()],\n})\n"
  },
  {
    "path": "README.md",
    "language": "md",
    "content": "# Grade Book\n\nA class list in Vue: show every student's quiz scores as one average, search by name, work\nout the class average, and flag anyone who needs help. You'll use v-for, v-model, a function,\na computed property and a class binding. Follow the numbered `TODO` comments in\n`src/App.vue`, in order.\n"
  },
  {
    "path": "src/main.js",
    "language": "js",
    "content": "// Reports errors and console output to your CodeAlong workspace. Keep this import first.\nimport './ca-probe.js'\n\nimport { createApp } from 'vue'\nimport App from './App.vue'\nimport './style.css'\n\ncreateApp(App).mount('#app')\n"
  },
  {
    "path": "src/ca-probe.js",
    "language": "js",
    "content": "// CodeAlong runtime probe: reports errors in your app to your CodeAlong workspace.\n// You don't need to edit this file.\n//\n// Each error goes to the Vite dev server, which prints it in the terminal for CodeAlong to read\n// (the ca-errors plugin in vite.config.js). Works in the preview and when it's popped out.\n\n// sends one error to the Vite dev server over its hot-reload connection.\n// import.meta.hot only exists while running under pnpm dev, so ?. skips it otherwise\nfunction sendError(raw) {\n  import.meta.hot?.send('ca:error', raw)\n}\n\n// errors thrown while the app runs, e.g. TypeError, ReferenceError\nwindow.addEventListener('error', (event) => {\n  sendError({\n    name: event.error?.name,\n    // event.message on its own starts with \"Uncaught \", the error object's message doesn't\n    message: event.error?.message ?? event.message,\n    filename: event.filename,\n    lineno: event.lineno,\n  })\n})\n\n// promises nobody caught, e.g. a failed await axios.get(...)\nwindow.addEventListener('unhandledrejection', (event) => {\n  const err = event.reason\n  // the browser doesn't say where a promise failed, so filename and lineno stay null\n  sendError({ name: err?.name, message: err?.message ?? String(err), filename: null, lineno: null })\n})\n"
  },
  {
    "path": "src/App.vue",
    "language": "vue",
    "content": "<script setup>\nimport { ref, computed } from 'vue'\nimport { students } from './data.js'\n\n// TODO 1: Show one row per student in the table\nconst rows = ref(students)\n\n// TODO 2: Filter the table as you type in the search box\nconst search = ref('')\n\n// TODO 3: Work out a student's average from their scores\nfunction average(scores) {\n}\n\n// TODO 4: Show the class average with a computed property\n\n// TODO 5: Highlight anyone averaging below 50\n</script>\n\n<template>\n  <main class=\"page\">\n    <h1>Grade Book</h1>\n    <input class=\"search\" placeholder=\"Search by name\" />\n\n    <table>\n      <thead>\n        <tr><th>Name</th><th>Average</th></tr>\n      </thead>\n      <tbody>\n        <!-- One row per student goes here -->\n      </tbody>\n    </table>\n  </main>\n</template>\n"
  },
  {
    "path": "src/data.js",
    "language": "js",
    "content": "// The class list: each student's quiz scores, out of 100\nexport const students = [\n  { id: 1, name: 'Aisha Rahman', scores: [78, 85, 92] },\n  { id: 2, name: 'Bryan Lim', scores: [64, 58, 71] },\n  { id: 3, name: 'Chloe Tan', scores: [91, 88, 95] },\n  { id: 4, name: 'Daniel Ng', scores: [45, 52, 38] },\n  { id: 5, name: 'Elena Koh', scores: [82, 79, 88] },\n  { id: 6, name: 'Farid Hassan', scores: [55, 61, 49] },\n  { id: 7, name: 'Grace Ong', scores: [73, 80, 77] },\n  { id: 8, name: 'Hiro Sato', scores: [39, 44, 51] },\n  { id: 9, name: 'Isla Chua', scores: [88, 92, 85] },\n  { id: 10, name: 'Jun Wei', scores: [67, 70, 62] },\n  { id: 11, name: 'Kavya Iyer', scores: [95, 98, 93] },\n  { id: 12, name: 'Leo Fernandez', scores: [48, 40, 46] },\n]\n"
  },
  {
    "path": "src/style.css",
    "language": "css",
    "content": ":root {\n  --ink: #1f2937;\n  --muted: #6b7280;\n  --line: #e5e7eb;\n  --bg: #f9fafb;\n  --low: #fef2f2;\n  --low-ink: #b91c1c;\n}\n\n* {\n  box-sizing: border-box;\n}\n\nbody {\n  margin: 0;\n  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;\n  color: var(--ink);\n  background: var(--bg);\n}\n\n.page {\n  max-width: 640px;\n  margin: 0 auto;\n  padding: 24px;\n}\n\n.search {\n  width: 100%;\n  padding: 8px 10px;\n  margin-bottom: 16px;\n  border: 1px solid var(--line);\n  border-radius: 6px;\n}\n\ntable {\n  width: 100%;\n  border-collapse: collapse;\n  background: white;\n}\n\nth,\ntd {\n  padding: 8px 12px;\n  text-align: left;\n  border-bottom: 1px solid var(--line);\n}\n\n.summary {\n  margin-top: 16px;\n  font-weight: 600;\n}\n\n.low {\n  background: var(--low);\n  color: var(--low-ink);\n}\n"
  }
]$gb$);

-- A small one-page project for the lessons that aren't taught in the seed: Grade Book's setup
-- with its own App.vue and README, and no data file.
create function seed.small_project(p_title text, p_app text, p_readme text) returns jsonb
language sql as $$
    select jsonb_agg(
               case e->>'path'
                   when 'src/App.vue' then jsonb_set(e, '{content}', to_jsonb(p_app))
                   when 'README.md'   then jsonb_set(e, '{content}', to_jsonb(p_readme))
                   when 'index.html'  then jsonb_set(e, '{content}', to_jsonb(replace(
                       e->>'content', '<title>Grade Book</title>', '<title>' || p_title || '</title>')))
                   else e end
               order by i)
      from jsonb_array_elements((select files from seed.project where name = 'gradebook'))
           with ordinality x(e, i)
     where e->>'path' <> 'src/data.js'
$$;

create table seed.small (name text primary key, title text, app text, readme text);
insert into seed.small values
('counter', 'Counter & Lists', $v$<script setup>
import { ref } from 'vue'

// TODO 1: Make the button add one to count each time it's clicked
const count = ref(0)

// TODO 2: Add the typed fruit to the list when you press Enter, then clear the box
const fruit = ref('')
const fruits = ref(['Apple', 'Banana'])
</script>

<template>
  <main class="page">
    <h1>Counter &amp; Lists</h1>
    <button>Clicked {{ count }} times</button>

    <input v-model="fruit" class="search" placeholder="Add a fruit" />
    <ul>
      <li v-for="f in fruits" :key="f">{{ f }}</li>
    </ul>
  </main>
</template>
$v$, $v$# Counter & Lists

Two warm-ups for Vue's reactivity: a button that counts its clicks, and a list you add to.
Follow the `TODO` comments in `src/App.vue`.
$v$),
('hello', 'Hello Vue', $v$<script setup>
import { ref } from 'vue'

// TODO 1: Change the greeting to use your own name
const name = ref('world')
</script>

<template>
  <main class="page">
    <h1>Hello, {{ name }}!</h1>
    <input v-model="name" class="search" />
  </main>
</template>
$v$, $v$# Hello Vue

Your first Vue component: a greeting that follows what you type. Start in `src/App.vue`.
$v$),
('sandbox', 'Practice sandbox', $v$<script setup>
import { ref } from 'vue'

// Anything goes: try out what we did in class
const message = ref('Edit me in src/App.vue')
</script>

<template>
  <main class="page">
    <h1>{{ message }}</h1>
  </main>
</template>
$v$, $v$# Practice sandbox

A blank Vue project to try things out in, outside class. Nothing here is marked.
$v$);

create function seed.small_files(p_name text) returns jsonb language sql as $$
    select seed.small_project(title, app, readme) from seed.small where name = p_name
$$;


-- 5. The prof's code at each checkpoint ------------------------------------
-- Checkpoint k = the starter with the solutions to TODOs 1…k filled in, so the replay
-- shows the code actually growing. Each patch swaps one exact piece of text.

create table seed.patch (proj text, k int, ord int, path text, find text, repl text);
insert into seed.patch (proj, k, ord, path, find, repl)
select 'minicart', * from (values
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

-- the trouble spot: inside <script setup> it's props.items; the template can say items
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
})$p$)
) v(k, ord, path, find, repl);

insert into seed.patch (proj, k, ord, path, find, repl)
select 'gradebook', * from (values
(1, 1, 'src/App.vue', $p$        <!-- One row per student goes here -->
$p$, $p$        <!-- One row per student goes here -->
        <tr v-for="s in rows" :key="s.id">
          <td>{{ s.name }}</td>
          <td>{{ average(s.scores) }}</td>
        </tr>
$p$),
(2, 1, 'src/App.vue', $p$const search = ref('')
$p$, $p$const search = ref('')
const shown = computed(() =>
  rows.value.filter((s) => s.name.toLowerCase().includes(search.value.toLowerCase())),
)
$p$),
(2, 2, 'src/App.vue', $p$<input class="search" placeholder="Search by name" />$p$, $p$<input v-model="search" class="search" placeholder="Search by name" />$p$),
(2, 3, 'src/App.vue', $p$<tr v-for="s in rows" :key="s.id">$p$, $p$<tr v-for="s in shown" :key="s.id">$p$),
(3, 1, 'src/App.vue', $p$function average(scores) {
}$p$, $p$function average(scores) {
  return Math.round(scores.reduce((sum, n) => sum + n, 0) / scores.length)
}$p$),
(4, 1, 'src/App.vue', $p$// TODO 4: Show the class average with a computed property
$p$, $p$// TODO 4: Show the class average with a computed property
const classAverage = computed(() => {
  if (!shown.value.length) return 0
  const total = shown.value.reduce((sum, s) => sum + average(s.scores), 0)
  return Math.round(total / shown.value.length)
})
$p$),
(4, 2, 'src/App.vue', $p$    </table>
$p$, $p$    </table>
    <p class="summary">Class average: {{ classAverage }}</p>
$p$),
(5, 1, 'src/App.vue', $p$<tr v-for="s in shown" :key="s.id">$p$, $p$<tr v-for="s in shown" :key="s.id" :class="{ low: average(s.scores) < 50 }">$p$)
) v(k, ord, path, find, repl);

-- Swap one piece of text in one file. Raises if the text isn't there, so a change to a
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
create function seed.files_at(p_proj text, upto int) returns jsonb language plpgsql as $$
declare
    f jsonb := (select files from seed.project where name = p_proj);
    p record;
begin
    for p in select * from seed.patch where proj = p_proj and k <= upto order by k, ord loop
        f := seed.patched(f, p.path, p.find, p.repl);
    end loop;
    return f;
end $$;

-- The classic mistakes, as the code that makes them
-- Mini Cart checkpoint 4: items instead of props.items inside <script setup>
create function seed.minicart_bug() returns jsonb language sql as $$
    select seed.patched(seed.files_at('minicart', 4), 'src/components/ItemCard.vue', 'props.items.find', 'items.find')
$$;
-- Grade Book checkpoint 3: s.score instead of s.scores, so scores is undefined in average()
create function seed.gradebook_bug() returns jsonb language sql as $$
    select seed.patched(seed.files_at('gradebook', 3), 'src/App.vue', 'average(s.scores)', 'average(s.score)')
$$;

-- What the AI writes on a help request (design-docs/05 §8a): { summary, rootCause, category,
-- stuckAt: { checkpoint, file, line }, confidence, model, analyzedAt }
create function seed.analysis(
    p_summary text, p_cause text, p_category text, p_seq int, p_file text, p_line int,
    p_confidence text, p_at timestamptz
) returns jsonb language sql as $$
    select jsonb_build_object(
        'summary', p_summary, 'rootCause', p_cause, 'category', p_category,
        'stuckAt', jsonb_build_object('checkpoint', p_seq, 'file', p_file, 'line', p_line),
        'confidence', p_confidence, 'model', 'openai/gpt-oss-20b', 'analyzedAt', p_at)
$$;


-- 6. Lessons ------------------------------------
-- IS216 G2 has a folder per week; Week 6 holds two files. Mini Cart is also copied into last
-- term's course and Prof Tan's (lessons belong to a course).

insert into public.lessons (id, course_id, title, week, description, files, entry_file, status, created_by, created_at) values
    (seed.l(1),  seed.c(1), 'Week 6 · Mini Cart', 6,
     'Props, emits, axios against a real Express API, a computed total and localStorage.',
     seed.files_at('minicart', 0), 'index.html', 'ready', seed.u(1), '2026-09-20 10:00+08'),
    (seed.l(2),  seed.c(2), 'Week 6 · Mini Cart', 6,
     'Props, emits, axios against a real Express API, a computed total and localStorage.',
     seed.files_at('minicart', 0), 'index.html', 'ready', seed.u(1), '2025-09-20 10:00+08'),
    (seed.l(3),  seed.c(3), 'Week 6 · Mini Cart', 6,
     'Props, emits, axios against a real Express API, a computed total and localStorage.',
     seed.files_at('minicart', 0), 'index.html', 'ready', seed.u(16), '2026-09-21 10:00+08'),
    (seed.l(11), seed.c(1), 'Week 5 · Grade Book', 5,
     'v-for, v-model, a function and a computed property over a class list.',
     seed.files_at('gradebook', 0), 'index.html', 'ready', seed.u(1), '2026-09-15 10:00+08'),
    -- ready but never taught: Start new session works on it, and it can still be deleted
    (seed.l(12), seed.c(1), 'Week 4 · Counter & Lists', 4,
     'Warm-ups for reactivity: ref, events and v-for.',
     seed.small_files('counter'), 'index.html', 'ready', seed.u(1), '2026-09-08 10:00+08'),
    -- a second file in the Week 6 folder: extension tasks, starting from the finished Mini Cart
    (seed.l(13), seed.c(1), 'Week 6 · Cart extras', 6,
     'Extension tasks for early finishers: a discount code and stock limits.',
     seed.patched(seed.files_at('minicart', 8), 'README.md', 'Follow the numbered `TODO`',
                  'Extras: add a discount code box, and stop the cart going past the stock.' || chr(10) || chr(10) || 'Follow the numbered `TODO`'),
     'index.html', 'ready', seed.u(1), '2026-10-10 10:00+08'),
    -- prepared ahead: hidden from students until the prof switches it on
    (seed.l(14), seed.c(1), 'Week 7 · Checkout Form', 7,
     'Form validation and a POST with a loading state.',
     seed.files_at('minicart', 8), 'index.html', 'draft', seed.u(1), '2026-10-28 10:00+08'),
    -- last term's version, kept for its past classes but out of use
    (seed.l(15), seed.c(1), 'Week 3 · Hello Vue (old)', 3,
     'The first component, from last term.',
     seed.small_files('hello'), 'index.html', 'archived', seed.u(1), '2026-08-20 10:00+08'),
    -- no week: sits in the "No week" folder
    (seed.l(16), seed.c(1), 'Practice sandbox', null,
     'A blank project for trying things out.',
     seed.small_files('sandbox'), 'index.html', 'ready', seed.u(1), '2026-08-25 10:00+08'),
    (seed.l(21), seed.c(4), 'Week 2 · Hello Vue', 2,
     'Your first Vue component.',
     seed.small_files('hello'), 'index.html', 'ready', seed.u(1), '2026-08-15 10:00+08');


-- 7. Sessions and checkpoints ------------------------------------

insert into public.sessions (id, lesson_id, course_id, started_by, join_code, status,
                             checkpoint_seq, settings, announcement, started_at, ended_at) values
    -- Week 6, 12 Oct: replay, report, help history, notes
    (seed.s(1), seed.l(1), seed.c(1), seed.u(1), 'MNCART', 'ended', 8,
     default, null, '2026-10-12 14:00+08', '2026-10-12 15:35+08'),
    -- same lesson, last term (report only)
    (seed.s(2), seed.l(2), seed.c(2), seed.u(1), 'MNCT25', 'ended', 0,
     default, null, '2025-10-13 14:00+08', '2025-10-13 15:35+08'),
    -- Prof Tan's run (report only)
    (seed.s(3), seed.l(3), seed.c(3), seed.u(16), 'TANMCT', 'ended', 0,
     default, null, '2026-10-13 10:00+08', '2026-10-13 11:35+08'),
    -- LIVE now: Mini Cart again, on checkpoint 3. idleAfterSec is 3600 (not 180) so the
    -- students stay "here" for an hour after a reset (two are idle on purpose: see step 10).
    (seed.s(4), seed.l(1), seed.c(1), seed.u(1), 'CART42', 'live', 3,
     '{"allowCatchUp": true, "hintsEnabled": false, "idleAfterSec": 3600}',
     jsonb_build_object('text', 'ItemCard is where build errors show up — check your import paths.',
                        'at', now() - interval '5 minutes'),
     now() - interval '25 minutes', null),
    -- Week 5, 5 Oct: the second replay and report
    (seed.s(5), seed.l(11), seed.c(1), seed.u(1), 'GRADE5', 'ended', 5,
     default, null, '2026-10-05 14:00+08', '2026-10-05 15:15+08');

-- The titles Prof Lee typed when saving each checkpoint
create table seed.checkpoint_titles (proj text, k int, title text, primary key (proj, k));
insert into seed.checkpoint_titles values
    ('minicart', 1, 'Categories load on mount'),
    ('minicart', 2, 'Items load for the selected category'),
    ('minicart', 3, 'ItemCard with an items prop'),
    ('minicart', 4, 'Emit add-to-cart — props.items in the script, not items!'),
    ('minicart', 5, 'Add to cart, or bump the quantity'),
    ('minicart', 6, 'Computed total'),
    ('minicart', 7, 'Cart survives a refresh'),
    ('minicart', 8, 'Reset and Checkout'),
    ('gradebook', 1, 'A row for every student'),
    ('gradebook', 2, 'Search filters as you type'),
    ('gradebook', 3, 'Each average — s.scores, not s.score!'),
    ('gradebook', 4, 'Class average with computed'),
    ('gradebook', 5, 'Highlight anyone below 50');

-- Week 6: every 10 minutes from 14:10
insert into public.checkpoints (session_id, seq, files, title, created_by, created_at)
select seed.s(1), k, seed.files_at('minicart', k), title, seed.u(1),
       timestamptz '2026-10-12 14:00+08' + make_interval(mins => k * 10)
  from seed.checkpoint_titles where proj = 'minicart';

-- Week 5: every 12 minutes from 14:12
insert into public.checkpoints (session_id, seq, files, title, created_by, created_at)
select seed.s(5), k, seed.files_at('gradebook', k), title, seed.u(1),
       timestamptz '2026-10-05 14:00+08' + make_interval(mins => k * 12)
  from seed.checkpoint_titles where proj = 'gradebook';

-- Live: the first three, saved over the last 20 minutes
insert into public.checkpoints (session_id, seq, files, title, created_by, created_at)
select seed.s(4), k, seed.files_at('minicart', k), title, seed.u(1),
       now() - make_interval(mins => 25 - k * 6)
  from seed.checkpoint_titles where proj = 'minicart' and k <= 3;


-- 8. The two past classes, minute by minute ------------------------------------
-- Checkpoint k lands every `step` minutes, which puts everyone back to in progress; each
-- student clicks Done `pace` minutes later. `err` students hit the class's classic mistake on
-- its checkpoint first, and the `fix` ones among them get past it by loading the prof's
-- checkpoint. `stuck` ones stop clicking Done after a point; `catchup` ones of those load the
-- latest checkpoint once. The report is then built from this history by the same
-- build_session_report the app runs when a class ends.

create table seed.attend (cls int, n int, join_min int, pace int, err boolean, stuck boolean,
                          catchup boolean, fix boolean default false);

-- Week 6 · Mini Cart (MNCART): 20 of 23 joined (Uma, Victor and Wen Hui didn't).
-- 9 hit items-is-not-defined on checkpoint 4; 4 never reach checkpoints 7 and 8.
insert into seed.attend values
    (1,  4, 1, 3, false, false, false),   -- Alex
    (1,  5, 1, 5, true,  false, false),   -- Bea
    (1,  6, 2, 4, false, false, false),   -- Chen
    (1,  7, 2, 6, true,  false, false),   -- Dana
    (1,  8, 3, 5, false, true,  true),    -- Eli
    (1,  9, 1, 4, true,  false, false),   -- Faye
    (1, 10, 3, 7, true,  true,  false),   -- Gus
    (1, 11, 2, 3, true,  false, false),   -- Hana
    (1, 12, 3, 6, false, true,  true),    -- Ivan
    (1, 13, 1, 5, true,  false, false),   -- Jae
    (1, 14, 2, 2, false, false, false),   -- Kim
    (1, 18, 1, 6, true,  false, false),   -- Lucas
    (1, 19, 2, 4, false, false, false),   -- Mei
    (1, 20, 1, 3, false, false, false),   -- Nadia
    (1, 21, 4, 5, false, false, false),   -- Omar
    (1, 22, 2, 4, false, false, false),   -- Priya
    (1, 23, 1, 3, false, false, false),   -- Quinn
    (1, 24, 3, 6, true,  false, false),   -- Rachel
    (1, 25, 5, 7, false, true,  true),    -- Sam
    (1, 26, 2, 5, true,  false, false);   -- Tara

-- Dana, Hana, Lucas and Tara get past it by loading checkpoint 4
update seed.attend set fix = true where cls = 1 and n in (7, 11, 18, 26);

-- Week 5 · Grade Book (GRADE5): 21 of 23 joined (Sam and Wen Hui didn't).
-- 7 hit the s.score mistake on checkpoint 3; 3 never reach checkpoint 5.
insert into seed.attend values
    (5,  4, 1, 3, false, false, false),   -- Alex
    (5,  5, 1, 4, false, false, false),   -- Bea
    (5,  6, 2, 5, true,  false, false),   -- Chen
    (5,  7, 3, 6, false, true,  true),    -- Dana
    (5,  8, 2, 4, true,  false, false),   -- Eli
    (5,  9, 1, 3, false, false, false),   -- Faye
    (5, 10, 4, 7, true,  true,  false),   -- Gus
    (5, 11, 2, 4, false, false, false),   -- Hana
    (5, 12, 1, 5, false, false, false),   -- Ivan
    (5, 13, 2, 6, true,  false, false),   -- Jae
    (5, 14, 1, 2, false, false, false),   -- Kim
    (5, 18, 2, 5, false, false, false),   -- Lucas
    (5, 19, 1, 4, true,  false, false),   -- Mei
    (5, 20, 3, 3, false, false, false),   -- Nadia
    (5, 21, 2, 6, true,  false, false),   -- Omar
    (5, 22, 1, 4, false, false, false),   -- Priya
    (5, 23, 2, 5, true,  false, false),   -- Quinn
    (5, 24, 1, 3, false, false, false),   -- Rachel
    (5, 26, 2, 4, false, false, false),   -- Tara
    (5, 27, 4, 7, false, true,  true),    -- Uma
    (5, 28, 3, 5, false, false, false);   -- Victor
-- Eli, Jae and Omar get past it by loading checkpoint 3
update seed.attend set fix = true where cls = 5 and n in (8, 13, 21);

-- status_history, written exactly as the triggers would have: a row each time the derived
-- state changes (05 §4), plus a catch_up row when they load the latest checkpoint. Written
-- directly because the triggers stamp now(), not the class's own time.
create function seed.play(p_cls int, p_t0 timestamptz, p_cps int, p_step int,
                          p_err_seq int, p_err_key text, p_stuck_after int)
returns void language plpgsql as $$
declare
    sid uuid := seed.s(p_cls);
    s   record;
    k   int;
    tk  timestamptz;
begin
    for s in select * from seed.attend where cls = p_cls order by n loop
        insert into public.status_history (session_id, student_id, state, checkpoint_seq, at)
        values (sid, seed.u(s.n), 'in_progress', 0, p_t0 + make_interval(mins => s.join_min));

        for k in 1..p_cps loop
            tk := p_t0 + make_interval(mins => k * p_step);

            -- checkpoint k resets "done on k-1" to in_progress (before checkpoint 1 they're
            -- already in_progress, so nothing changes)
            if k > 1 then
                insert into public.status_history (session_id, student_id, state, checkpoint_seq, at)
                values (sid, seed.u(s.n), 'in_progress', k, tk);
            end if;

            -- stuck: no more Done. A catch-up student loads the latest checkpoint once instead
            if s.stuck and k > p_stuck_after then
                if s.catchup and k = p_stuck_after + 1 then
                    insert into public.status_history (session_id, student_id, state, checkpoint_seq, at)
                    values (sid, seed.u(s.n), 'catch_up', k, tk + interval '8 minutes');
                end if;
                continue;
            end if;

            if s.err and k = p_err_seq then
                insert into public.status_history (session_id, student_id, state, checkpoint_seq, error_key, at)
                values (sid, seed.u(s.n), 'error', k, p_err_key, tk + interval '2 minutes');
                -- loads the prof's checkpoint to get past it
                if s.fix then
                    insert into public.status_history (session_id, student_id, state, checkpoint_seq, at)
                    values (sid, seed.u(s.n), 'catch_up', k, tk + interval '3 minutes');
                end if;
            end if;

            insert into public.status_history (session_id, student_id, state, checkpoint_seq, at)
            values (sid, seed.u(s.n), 'done', k,
                    tk + make_interval(mins => s.pace + case when s.err and k = p_err_seq then 2 else 0 end));
        end loop;
    end loop;
end $$;

select seed.play(1, '2026-10-12 14:00+08', 8, 10, 4, 'ReferenceError: items is not defined', 6);
select seed.play(5, '2026-10-05 14:00+08', 5, 12, 3,
                 'TypeError: Cannot read properties of undefined (reading ''reduce'')', 4);

-- Each student's final row. Its derived state equals their last history row, so the
-- status_history trigger adds nothing.
create function seed.finish(p_cls int, p_proj text, p_cps int, p_stuck_after int, p_end timestamptz,
                            p_err_seq int, p_bug jsonb)
returns void language sql as $$
    insert into public.student_status (session_id, student_id, done_seq, catch_ups, last_seen_at, joined_at)
    select seed.s(p_cls), seed.u(a.n),
           case when a.stuck then p_stuck_after else p_cps end,
           a.catchup::int + a.fix::int,
           p_end - interval '1 minute',
           s.started_at + make_interval(mins => a.join_min)
      from seed.attend a join public.sessions s on s.id = seed.s(p_cls)
     where a.cls = p_cls;

    -- Everyone's last autosave (the student view of the replay shows it). Catch-up students
    -- have the checkpoint they loaded; the code they had before is kept as before_catchup.
    insert into public.snapshots (session_id, student_id, reason, files, created_at, updated_at)
    select seed.s(p_cls), seed.u(a.n), 'autosave',
           seed.files_at(p_proj, case when a.catchup then p_stuck_after + 1
                                      when a.stuck then p_stuck_after else p_cps end),
           s.started_at + make_interval(mins => a.join_min), p_end - interval '1 minute'
      from seed.attend a join public.sessions s on s.id = seed.s(p_cls)
     where a.cls = p_cls;

    insert into public.snapshots (session_id, student_id, reason, files, created_at, updated_at)
    select seed.s(p_cls), seed.u(a.n), 'before_catchup', seed.files_at(p_proj, p_stuck_after), h.at, h.at
      from seed.attend a
      join public.status_history h
        on h.session_id = seed.s(p_cls) and h.student_id = seed.u(a.n) and h.state = 'catch_up'
       and h.checkpoint_seq = p_stuck_after + 1
     where a.cls = p_cls and a.catchup;

    -- the ones who loaded the checkpoint to get past the mistake: their broken code is kept
    insert into public.snapshots (session_id, student_id, reason, files, created_at, updated_at)
    select seed.s(p_cls), seed.u(a.n), 'before_catchup', p_bug, h.at, h.at
      from seed.attend a
      join public.status_history h
        on h.session_id = seed.s(p_cls) and h.student_id = seed.u(a.n) and h.state = 'catch_up'
       and h.checkpoint_seq = p_err_seq
     where a.cls = p_cls and a.fix;
$$;

select seed.finish(1, 'minicart', 8, 6, '2026-10-12 15:35+08', 4, seed.minicart_bug());
select seed.finish(5, 'gradebook', 5, 4, '2026-10-05 15:15+08', 3, seed.gradebook_bug());

-- Help requests: each carries its own help_request snapshot of the code at the moment they
-- asked. The number after the student is the checkpoint the class was on.
create function seed.help(
    p_cls int, p_student int, p_seq int, p_type text, p_files jsonb, p_message text, p_status text,
    p_staff int, p_reply text, p_at timestamptz, p_seat text default null, p_analysis jsonb default null
) returns void language plpgsql as $$
declare
    snap uuid;
begin
    insert into public.snapshots (session_id, student_id, reason, files, created_at, updated_at)
    values (seed.s(p_cls), seed.u(p_student), 'help_request', p_files, p_at, p_at)
    returning id into snap;

    insert into public.help_requests (
        session_id, student_id, checkpoint_seq, type, snapshot_id, message, in_person, seat, status,
        claimed_by, thread, analysis, telegram_notified_at, created_at, updated_at
    ) values (
        seed.s(p_cls), seed.u(p_student), p_seq, p_type, snap, p_message, p_seat is not null, p_seat,
        p_status, seed.u(p_staff),
        case when p_reply is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object(
            'role', 'staff', 'author_id', seed.u(p_staff), 'body', p_reply,
            'at', p_at + interval '3 minutes')) end,
        p_analysis,
        case when p_seat is not null then p_at end,
        p_at, p_at + interval '3 minutes'
    );
end $$;

-- Week 6 (MNCART): 3 passed checks, 3 replied helps, 1 resolved in person
select seed.help(1, 4, 2, 'check', seed.files_at('minicart', 2), null, 'passed', 2,
                 'Looks good — nice use of params.', '2026-10-12 14:22+08');
select seed.help(1, 6, 5, 'check', seed.files_at('minicart', 5), null, 'passed', 3,
                 'Yes — and the quantity bump is exactly right.', '2026-10-12 14:53+08');
select seed.help(1, 24, 6, 'check', seed.files_at('minicart', 6), null, 'passed', 2,
                 'Correct. toFixed(2) for the total is a nice touch.', '2026-10-12 15:05+08');
select seed.help(1, 5, 4, 'help', seed.minicart_bug(), 'items is not defined in ItemCard?', 'replied', 2,
                 'Inside <script setup> the prop is props.items. The template can say items; the script can''t.',
                 '2026-10-12 14:43+08', null,
                 seed.analysis('ItemCard uses items instead of props.items in the script',
                               'In ItemCard.vue, addToCart looks the item up with items.find, but inside <script setup> the prop is only reachable as props.items. The template can use items directly, which is probably why they expected the script to work the same way. Using props.items in addToCart fixes it.',
                               'undefined-variable', 4, 'src/components/ItemCard.vue', 11, 'high', '2026-10-12 14:43:20+08'));
select seed.help(1, 11, 4, 'help', seed.minicart_bug(), 'My add to cart button crashes', 'replied', 1,
                 'Same one as half the room: props.items, not items. Check line 11 of ItemCard.vue.',
                 '2026-10-12 14:44+08', null,
                 seed.analysis('items is not defined when Add to cart runs',
                               'The click handler in ItemCard.vue reads items, which isn''t a variable in the script: the prop has to be read through the object defineProps returns. The reference uses props.items here. They likely copied the template''s items into the script.',
                               'undefined-variable', 4, 'src/components/ItemCard.vue', 11, 'high', '2026-10-12 14:44:15+08'));
select seed.help(1, 18, 4, 'help', seed.minicart_bug(), 'Add to cart does nothing and the console is red', 'replied', 3,
                 'Check the console line: it''s ItemCard.vue, props.items instead of items.',
                 '2026-10-12 14:45+08', null,
                 seed.analysis('ItemCard reads items instead of props.items',
                               'Clicking Add to cart throws because addToCart in ItemCard.vue uses items, which is undefined in the script. Props are on the props object in <script setup>. The rest matches the checkpoint.',
                               'undefined-variable', 4, 'src/components/ItemCard.vue', 11, 'medium', '2026-10-12 14:45:10+08'));
select seed.help(1, 10, 7, 'help', seed.files_at('minicart', 6), 'Not sure where the watch goes', 'resolved', 3,
                 null, '2026-10-12 15:15+08', 'C14');

-- Week 5 (GRADE5): 2 passed checks, 2 replied helps, 1 resolved in person
select seed.help(5, 4, 2, 'check', seed.files_at('gradebook', 2), null, 'passed', 2,
                 'Spot on — computed is exactly right for the filter.', '2026-10-05 14:30+08');
select seed.help(5, 19, 4, 'check', seed.files_at('gradebook', 4), null, 'passed', 3,
                 'Yes, and good call guarding against an empty list.', '2026-10-05 14:55+08');
select seed.help(5, 6, 3, 'help', seed.gradebook_bug(), 'The average column is blank and the console mentions reduce', 'replied', 3,
                 'Your template passes s.score — the field in data.js is scores.', '2026-10-05 14:41+08', null,
                 seed.analysis('average() gets s.score, which is undefined',
                               'The table calls average(s.score), but each student in data.js has scores (plural), so average receives undefined and .reduce throws. The reference passes s.scores. A one-letter field name mismatch.',
                               'typo', 3, 'src/App.vue', 37, 'high', '2026-10-05 14:41:12+08'));
select seed.help(5, 23, 3, 'help', seed.gradebook_bug(), 'Cannot read properties of undefined?', 'replied', 1,
                 'Check the field name you pass to average — scores, with an s.', '2026-10-05 14:43+08', null,
                 seed.analysis('Wrong field name passed to average()',
                               'average(s.score) passes undefined because the data uses scores. Calling .reduce on undefined throws a TypeError, so no average shows. Matching the field name to data.js fixes it.',
                               'typo', 3, 'src/App.vue', 37, 'high', '2026-10-05 14:43:09+08'));
select seed.help(5, 21, 3, 'help', seed.gradebook_bug(), 'Can someone come over?', 'resolved', 2,
                 null, '2026-10-05 14:42+08', 'D2');

-- Notes on the replays: private to whoever wrote them (the prof's are only the prof's)
insert into public.notes (user_id, session_id, checkpoint_id, kind, body, created_at, updated_at)
select seed.u(n.author), c.session_id, c.id, 'note', n.body,
       c.created_at + interval '4 minutes', c.created_at + interval '4 minutes'
  from (values
      (4, 1, 4, 'props.items in the script, items in the template — that''s why ItemCard crashed for half the class.'),
      (4, 1, 7, 'watch(cart, …, { deep: true }) — without deep it only fires when the whole array is replaced.'),
      (5, 1, 4, 'defineProps returns the props object. Script: props.items. Template: items.'),
      (1, 1, 4, 'Next run: show props.items vs items on the board before saving checkpoint 4 — 9 of 20 hit it.'),
      (4, 5, 3, 'scores, not score — the field name has to match data.js exactly.'),
      (19, 5, 4, 'computed re-runs when shown changes, so the class average follows the search.')
  ) n(author, cls, seq, body)
  join public.checkpoints c on c.session_id = seed.s(n.cls) and c.seq = n.seq;

-- "Slow down" over each class (minutes after the start, +1 asks, -1 takes it back)
insert into public.slow_down_events (session_id, delta, at)
select seed.s(e.cls), e.delta, s.started_at + make_interval(mins => e.m)
  from (values (1, 43, 1), (1, 44, 1), (1, 45, 1), (1, 47, -1), (1, 48, -1), (1, 49, -1),
               (1, 74, 1), (1, 75, 1), (1, 76, 1), (1, 77, 1), (1, 88, -1), (1, 89, -1), (1, 90, -1), (1, 91, -1),
               (5, 38, 1), (5, 39, 1), (5, 40, 1), (5, 44, -1), (5, 46, -1), (5, 47, -1),
               (5, 62, 1), (5, 63, 1), (5, 70, -1), (5, 71, -1)) e(cls, m, delta)
  join public.sessions s on s.id = seed.s(e.cls)
 order by e.cls, e.m;


-- 9. Reports ------------------------------------
-- The two past classes: built from their history above by the function the app runs when a
-- class ends, then stamped at the class's own end time.
select public.build_session_report(seed.s(1));
select public.build_session_report(seed.s(5));
update public.session_reports r set generated_at = s.ended_at + interval '1 minute'
  from public.sessions s where s.id = r.session_id and s.id in (seed.s(1), seed.s(5));

-- Two older classes with no history kept, only their reports, for trends across terms.
-- checkpoints[]: { seq, title, reachedDone, dropOff, errorStudents, medianMinutesToDone,
--                  catchUps, helpRequests, trouble }

-- last term (MNCT25): checkpoint 4 is the top trouble spot again, so it shows as recurring
insert into public.session_reports (session_id, course_id, lesson_id, attendance, checkpoints, top_errors, slow_down_peak, generated_at)
values (
    seed.s(2), seed.c(2), seed.l(2),
    '{"joined": 24, "enrolled": 27}',
    $r$[
        {"seq": 1, "title": "Categories load on mount", "reachedDone": 24, "dropOff": 0, "errorStudents": 0, "medianMinutesToDone": null, "catchUps": 0, "helpRequests": 0, "trouble": 0.0},
        {"seq": 2, "title": "Items load for the selected category", "reachedDone": 24, "dropOff": 0, "errorStudents": 1, "medianMinutesToDone": null, "catchUps": 0, "helpRequests": 1, "trouble": 0.021},
        {"seq": 3, "title": "ItemCard with an items prop", "reachedDone": 23, "dropOff": 1, "errorStudents": 2, "medianMinutesToDone": null, "catchUps": 0, "helpRequests": 1, "trouble": 0.05},
        {"seq": 4, "title": "Emit add-to-cart — props.items in the script, not items!", "reachedDone": 19, "dropOff": 4, "errorStudents": 9, "medianMinutesToDone": null, "catchUps": 0, "helpRequests": 5, "trouble": 0.221},
        {"seq": 5, "title": "Add to cart, or bump the quantity", "reachedDone": 19, "dropOff": 0, "errorStudents": 1, "medianMinutesToDone": null, "catchUps": 0, "helpRequests": 0, "trouble": 0.017},
        {"seq": 6, "title": "Computed total", "reachedDone": 18, "dropOff": 1, "errorStudents": 0, "medianMinutesToDone": null, "catchUps": 0, "helpRequests": 1, "trouble": 0.017},
        {"seq": 7, "title": "Cart survives a refresh", "reachedDone": 17, "dropOff": 1, "errorStudents": 2, "medianMinutesToDone": null, "catchUps": 0, "helpRequests": 1, "trouble": 0.05},
        {"seq": 8, "title": "Reset and Checkout", "reachedDone": 17, "dropOff": 0, "errorStudents": 0, "medianMinutesToDone": null, "catchUps": 0, "helpRequests": 0, "trouble": 0.0}
    ]$r$,
    $r$[{"key": "ReferenceError: items is not defined", "students": 9, "seq": 4}]$r$,
    5, '2025-10-13 15:36+08'
);

-- Prof Tan's run (TANMCT): checkpoint 2 instead — must never show up in Prof Lee's trends
insert into public.session_reports (session_id, course_id, lesson_id, attendance, checkpoints, top_errors, slow_down_peak, generated_at)
values (
    seed.s(3), seed.c(3), seed.l(3),
    '{"joined": 30, "enrolled": 32}',
    $r$[
        {"seq": 1, "title": "Categories load on mount", "reachedDone": 29, "dropOff": 1, "errorStudents": 1, "medianMinutesToDone": null, "catchUps": 0, "helpRequests": 1, "trouble": 0.027},
        {"seq": 2, "title": "Items load for the selected category", "reachedDone": 24, "dropOff": 5, "errorStudents": 8, "medianMinutesToDone": null, "catchUps": 0, "helpRequests": 4, "trouble": 0.17},
        {"seq": 3, "title": "ItemCard with an items prop", "reachedDone": 23, "dropOff": 1, "errorStudents": 2, "medianMinutesToDone": null, "catchUps": 0, "helpRequests": 1, "trouble": 0.04},
        {"seq": 4, "title": "Emit add-to-cart — props.items in the script, not items!", "reachedDone": 23, "dropOff": 0, "errorStudents": 2, "medianMinutesToDone": null, "catchUps": 0, "helpRequests": 1, "trouble": 0.03},
        {"seq": 5, "title": "Add to cart, or bump the quantity", "reachedDone": 22, "dropOff": 1, "errorStudents": 1, "medianMinutesToDone": null, "catchUps": 0, "helpRequests": 0, "trouble": 0.023},
        {"seq": 6, "title": "Computed total", "reachedDone": 22, "dropOff": 0, "errorStudents": 0, "medianMinutesToDone": null, "catchUps": 0, "helpRequests": 0, "trouble": 0.0},
        {"seq": 7, "title": "Cart survives a refresh", "reachedDone": 21, "dropOff": 1, "errorStudents": 1, "medianMinutesToDone": null, "catchUps": 0, "helpRequests": 1, "trouble": 0.027},
        {"seq": 8, "title": "Reset and Checkout", "reachedDone": 21, "dropOff": 0, "errorStudents": 0, "medianMinutesToDone": null, "catchUps": 0, "helpRequests": 0, "trouble": 0.0}
    ]$r$,
    $r$[{"key": "TypeError: Cannot read properties of undefined (reading 'data')", "students": 8, "seq": 2}]$r$,
    4, '2026-10-13 11:36+08'
);


-- 10. The live class (CART42) ------------------------------------
-- 21 of the 23 are in (Uma and Wen Hui aren't), on checkpoint 3. Written through the
-- triggers, so their history is stamped now().
--   Done on 3 (8) · in progress, done on 2 (5) · idle, done on 1 (2: last seen 70 min ago)
--   errors (6): the ItemCard import typo ×3 in two spellings (one shape, so Common errors
--   shows its variants), a missing :items prop ×2, and one typo nobody else has
-- Only students connected right now count on the prof's dashboard, so the numbers there fill
-- in as people log in; the help queue, help summary and statuses are all here already.

create table seed.live (n int primary key, done int, err text, idle boolean, catchup boolean);
insert into seed.live values
    ( 4, 3, null, false, false),     -- Alex
    ( 8, 3, null, false, true),      -- Eli (caught up once)
    (14, 3, null, false, false),     -- Kim
    (20, 3, null, false, false),     -- Nadia
    (21, 3, null, false, false),     -- Omar
    (23, 3, null, false, false),     -- Quinn
    (25, 3, null, false, false),     -- Sam
    (26, 3, null, false, false),     -- Tara
    ( 6, 2, null, false, false),     -- Chen
    (11, 2, null, false, false),     -- Hana
    (13, 2, null, false, false),     -- Jae
    (18, 2, null, false, false),     -- Lucas
    (22, 2, null, false, false),     -- Priya
    ( 7, 1, null, true,  false),     -- Dana (idle)
    (24, 1, null, true,  false),     -- Rachel (idle)
    ( 5, 2, 'import', false, false), -- Bea
    (10, 2, 'import', false, false), -- Gus
    (28, 2, 'import_lower', false, false), -- Victor
    ( 9, 2, 'no_prop', false, false),      -- Faye
    (19, 2, 'no_prop', false, false),      -- Mei
    (12, 2, 'typo', false, false);         -- Ivan

-- the code behind each mistake, and the error the workspace reported for it (keys exactly as
-- shared/error-normalizer.js makes them)
create function seed.live_files(p_err text, p_done int) returns jsonb language sql as $$
    select case p_err
        when 'import' then seed.patched(seed.files_at('minicart', 3), 'src/App.vue',
                                        './components/ItemCard.vue', './components/Itemcard.vue')
        when 'import_lower' then seed.patched(seed.files_at('minicart', 3), 'src/App.vue',
                                        './components/ItemCard.vue', './components/itemcard.vue')
        when 'no_prop' then seed.patched(seed.files_at('minicart', 3), 'src/App.vue',
                                        '<ItemCard :items="items" ', '<ItemCard ')
        when 'typo' then seed.patched(seed.files_at('minicart', 3), 'src/App.vue',
                                        'categories.value = data', 'categries.value = data')
        else seed.files_at('minicart', p_done)
    end
$$;

create function seed.live_error(p_err text) returns jsonb language sql as $$
    select case
        when p_err in ('import', 'import_lower') then (
            select jsonb_build_object(
                'source', 'build', 'name', 'Error', 'message', msg, 'file', 'src/App.vue', 'line', 4,
                'key', 'Error: ' || msg,
                'shapeKey', 'Error: [plugin:vite:import-analysis] Failed to resolve import <str> from <str>. Does the file exist?',
                'at', now() - interval '3 minutes')
              from (select '[plugin:vite:import-analysis] Failed to resolve import "./components/'
                           || case p_err when 'import' then 'Itemcard' else 'itemcard' end
                           || '.vue" from "src/App.vue". Does the file exist?' as msg) m)
        when p_err = 'no_prop' then jsonb_build_object(
            'source', 'runtime', 'name', 'TypeError',
            'message', 'Cannot read properties of undefined (reading ''length'')',
            'file', 'src/components/ItemCard.vue', 'line', 9,
            'key', 'TypeError: Cannot read properties of undefined (reading ''length'')',
            'shapeKey', 'TypeError: Cannot read properties of undefined (reading <prop>)',
            'at', now() - interval '2 minutes')
        when p_err = 'typo' then jsonb_build_object(
            'source', 'runtime', 'name', 'ReferenceError', 'message', 'categries is not defined',
            'file', 'src/App.vue', 'line', 12,
            'key', 'ReferenceError: categries is not defined',
            'shapeKey', 'ReferenceError: <id> is not defined',
            'at', now() - interval '4 minutes')
    end
$$;

insert into public.student_status (session_id, student_id, done_seq, error, catch_ups, last_seen_at, joined_at)
select seed.s(4), seed.u(n), done, seed.live_error(err), case when catchup then 1 else 0 end,
       case when idle then now() - interval '70 minutes' else now() - make_interval(secs => n * 3) end,
       now() - make_interval(mins => 22 - (n % 5))
  from seed.live;

insert into public.snapshots (session_id, student_id, reason, files, created_at, updated_at)
select seed.s(4), seed.u(n), 'autosave', seed.live_files(err, done), now() - interval '20 minutes', now()
  from seed.live;
-- Eli's code from just before he loaded checkpoint 3
insert into public.snapshots (session_id, student_id, reason, files, created_at, updated_at)
values (seed.s(4), seed.u(8), 'before_catchup', seed.files_at('minicart', 2),
        now() - interval '6 minutes', now() - interval '6 minutes');

-- Priya's code: { category } given to axios.get as its options instead of { params: { category } }
create function seed.priya_files() returns jsonb language sql as $$
    select seed.patched(seed.files_at('minicart', 2), 'src/App.vue',
                        '{ params: { category: selectedCategory.value } }', '{ category: selectedCategory.value }')
$$;
update public.snapshots set files = seed.priya_files()
 where session_id = seed.s(4) and student_id = seed.u(22) and reason = 'autosave';

-- The help queue: every state a TA meets. Waiting first, oldest first.
create function seed.live_help(
    p_student int, p_seq int, p_type text, p_files jsonb, p_message text, p_status text,
    p_ago interval, p_staff int default null, p_seat text default null,
    p_analysis jsonb default null, p_thread jsonb default '[]', p_follow_ups int default 0
) returns void language plpgsql as $$
declare
    snap uuid;
begin
    insert into public.snapshots (session_id, student_id, reason, files, created_at, updated_at)
    values (seed.s(4), seed.u(p_student), 'help_request', p_files, now() - p_ago, now() - p_ago)
    returning id into snap;

    insert into public.help_requests (
        session_id, student_id, checkpoint_seq, type, snapshot_id, message, in_person, seat, status,
        claimed_by, thread, follow_ups, analysis, telegram_notified_at, created_at, updated_at
    ) values (
        seed.s(4), seed.u(p_student), p_seq, p_type, snap, p_message, p_seat is not null, p_seat,
        p_status, seed.u(p_staff), p_thread, p_follow_ups, p_analysis,
        case when p_seat is not null then now() - p_ago end,
        now() - p_ago, now() - p_ago + interval '1 minute'
    );
end $$;

-- Priya: replied, then she followed up, so it's back in the queue for anyone ("last handled by Ben").
-- She did add the category, as Ben said, but as axios's options instead of inside params
select seed.live_help(22, 2, 'help', seed.priya_files(), 'Picking a category doesn''t change the items',
    'open', '9 minutes', null, null,
    seed.analysis('The category is passed as an axios option, not a query parameter',
                  'loadItems calls axios.get(''/api/items'', { category: selectedCategory.value }), but axios only sends what is inside params as the query string, so ?category= never reaches the server and it returns every item. The reference wraps it: { params: { category: selectedCategory.value } }. They added the category as the TA suggested, just one level too high.',
                  'api-call', 2, 'src/App.vue', 23, 'high', now() - interval '2 minutes'),
    jsonb_build_array(
        jsonb_build_object('role', 'staff', 'author_id', seed.u(3), 'at', now() - interval '6 minutes',
                           'body', 'Check what you pass to axios.get — the API needs the category.'),
        jsonb_build_object('role', 'student', 'author_id', seed.u(22), 'at', now() - interval '3 minutes',
                           'body', 'I added it, but it still shows everything')),
    1);
-- Lucas: claimed by Ana, who's on it
select seed.live_help(18, 3, 'help', seed.live_files('no_prop', 2), 'ItemCard shows up but there are no items in it',
    'claimed', '5 minutes', 2, null,
    seed.analysis('ItemCard is rendered without its items prop',
                  'App.vue renders <ItemCard /> but never binds :items, so the component receives nothing to list. The reference passes :items="items". They may expect the child to see the parent''s variables automatically.',
                  'missing-prop', 3, 'src/App.vue', 57, 'high', now() - interval '4 minutes'));
-- Faye: the AI couldn't analyse it
select seed.live_help(9, 3, 'help', seed.live_files('no_prop', 2), 'ItemCard crashes when the page loads',
    'open', '3 minutes', null, null,
    jsonb_build_object('status', 'failed', 'reason', 'rate limited', 'analyzedAt', now() - interval '3 minutes'));
-- Gus and Bea: the same import typo, so "What the class is stuck on" groups them
select seed.live_help(10, 3, 'help', seed.live_files('import', 2), 'Blank page and a red error about an import',
    'open', '2 minutes', null, null,
    seed.analysis('ItemCard is imported with the wrong capitalisation',
                  'App.vue imports ./components/Itemcard.vue, but the file is ItemCard.vue. Imports are case-sensitive, so Vite can''t resolve it and the app won''t compile. Matching the file name exactly, capital C included, fixes it.',
                  'wrong-import', 3, 'src/App.vue', 4, 'high', now() - interval '100 seconds'));
select seed.live_help(5, 3, 'help', seed.live_files('import', 2), 'Vite says it can''t find ItemCard?',
    'open', '90 seconds', null, null,
    seed.analysis('The ItemCard import path has a lowercase c',
                  'The import in App.vue points at ./components/Itemcard.vue while the component file is ItemCard.vue. On a case-sensitive file system that is a different file, so the build fails before anything renders. The checkpoint imports ./components/ItemCard.vue.',
                  'wrong-import', 3, 'src/App.vue', 4, 'high', now() - interval '70 seconds'));
-- Nadia: Check my work, waiting
select seed.live_help(20, 3, 'check', seed.files_at('minicart', 3), null, 'open', '1 minute');
-- Mei: in person at her seat (the TAs get a Telegram ping); the AI is still analysing it
select seed.live_help(19, 3, 'help', seed.live_files('no_prop', 2), 'Can someone look at my screen?',
    'open', '30 seconds', null, 'B7');
-- Handled: a passed check, a resolved in-person request, and one the student took back
select seed.live_help(21, 2, 'check', seed.files_at('minicart', 2), null, 'passed', '11 minutes', 3);
select seed.live_help(11, 2, 'help', seed.files_at('minicart', 1), 'My categories dropdown is empty', 'resolved',
    '12 minutes', 2, 'A3');
select seed.live_help(13, 2, 'help', seed.files_at('minicart', 2), 'nvm, found it', 'cancelled', '6 minutes');

-- Chen, Lucas and Priya have tapped "Slow down" (staff see slow_down_count = 3, never who)
insert into public.slow_down_flags (session_id, student_id)
select seed.s(4), seed.u(n) from (values (6), (18), (22)) v(n);


drop schema seed cascade;
