// Hard-coded sample data for the prof-view wireframes. Nothing here is fetched:
// the shapes only mimic what session_tiles / steps / session_reports will return later.

export const lesson = {
  id: 'demo',
  title: 'Week 6 · Mini Cart',
  course: 'IS216 · G2',
  joinCode: 'K7QX2M',
}

export const steps = [
  { id: 1, order: 1, title: 'Add the ItemCard props', file: 'src/ItemCard.vue', line: 6, status: 'done' },
  { id: 2, order: 2, title: 'Emit add-to-cart', file: 'src/ItemCard.vue', line: 14, status: 'done' },
  { id: 3, order: 3, title: 'Fetch items with axios', file: 'src/App.vue', line: 9, status: 'done' },
  { id: 4, order: 4, title: 'Handle the add event', file: 'src/App.vue', line: 21, status: 'current' },
  { id: 5, order: 5, title: 'Computed cart total', file: 'src/App.vue', line: 30, status: 'todo' },
  { id: 6, order: 6, title: 'Remove an item', file: 'src/App.vue', line: 38, status: 'todo' },
  { id: 7, order: 7, title: 'Persist to localStorage', file: 'src/App.vue', line: 47, status: 'todo' },
  { id: 8, order: 8, title: 'POST the order to the API', file: 'src/App.vue', line: 55, status: 'todo' },
]

// state: error | behind | working | idle | done
export const students = [
  { id: 1, name: 'Aisha Rahman', step: 4, state: 'error', note: "Cannot read properties of undefined (reading 'price')" },
  { id: 2, name: 'Ben Tan', step: 4, state: 'error', note: "Cannot read properties of undefined (reading 'price')" },
  { id: 3, name: 'Chloe Lim', step: 4, state: 'working', note: '' },
  { id: 4, name: 'Daniel Ong', step: 2, state: 'behind', note: '' },
  { id: 5, name: 'Eli Koh', step: 4, state: 'working', note: '' },
  { id: 6, name: 'Farah Yusof', step: 5, state: 'done', note: '' },
  { id: 7, name: 'Gavin Teo', step: 3, state: 'behind', note: '' },
  { id: 8, name: 'Hana Seah', step: 4, state: 'error', note: "'axios' is not defined" },
  { id: 9, name: 'Ian Chua', step: 4, state: 'working', note: '' },
  { id: 10, name: 'Jia Wen', step: 1, state: 'idle', note: '' },
  { id: 11, name: 'Kai Ng', step: 4, state: 'working', note: '' },
  { id: 12, name: 'Lena Goh', step: 3, state: 'behind', note: '' },
  { id: 13, name: 'Marcus Wee', step: 4, state: 'done', note: '' },
  { id: 14, name: 'Nadia Pang', step: 4, state: 'error', note: "Cannot read properties of undefined (reading 'price')" },
  { id: 15, name: 'Owen Lee', step: 4, state: 'working', note: '' },
  { id: 16, name: 'Priya Nair', step: 2, state: 'idle', note: '' },
  { id: 17, name: 'Quinn Sim', step: 4, state: 'done', note: '' },
  { id: 18, name: 'Ravi Menon', step: 3, state: 'behind', note: '' },
  { id: 19, name: 'Sara Ho', step: 4, state: 'working', note: '' },
  { id: 20, name: 'Tom Yeo', step: 4, state: 'working', note: '' },
  { id: 21, name: 'Uma Das', step: 4, state: 'done', note: '' },
  { id: 22, name: 'Victor Lau', step: 1, state: 'idle', note: '' },
  { id: 23, name: 'Wendy Chia', step: 4, state: 'error', note: 'Unexpected token (14:8)' },
  { id: 24, name: 'Xavier Ang', step: 4, state: 'working', note: '' },
]

export const lostCount = 3

export const errorGroups = [
  { id: 1, message: "Cannot read properties of undefined (reading 'price')", count: 3, step: 4 },
  { id: 2, message: "'axios' is not defined", count: 1, step: 4 },
  { id: 3, message: 'Unexpected token', count: 1, step: 4 },
]

export const report = {
  attended: 24,
  // students who reached each step
  funnel: [24, 24, 22, 19, 11, 8, 5, 3],
  topErrors: [
    { message: "Cannot read properties of undefined (reading 'price')", count: 13, step: 4 },
    { message: "'axios' is not defined", count: 7, step: 3 },
    { message: 'Unexpected token', count: 4, step: 5 },
    { message: 'Network Error (ECONNREFUSED)', count: 3, step: 8 },
  ],
  recurring: [
    { step: 'Handle the add event', terms: '3 of last 4 terms', dropOff: '21%' },
    { step: 'Computed cart total', terms: '2 of last 4 terms', dropOff: '42%' },
  ],
  helpRequests: 9,
  avgWaitMin: 4,
}

// Bootstrap contextual classes only; every state also has an icon + label (colour is never the only signal).
export const stateMeta = {
  error: { label: 'Error', icon: '✕', badge: 'text-bg-danger', border: 'border-danger', btn: 'btn-danger', btnOutline: 'btn-outline-danger', bg: 'bg-danger' },
  behind: { label: 'Behind', icon: '▼', badge: 'text-bg-warning', border: 'border-warning', btn: 'btn-warning', btnOutline: 'btn-outline-warning', bg: 'bg-warning' },
  working: { label: 'In progress', icon: '●', badge: 'text-bg-primary', border: 'border-primary', btn: 'btn-primary', btnOutline: 'btn-outline-primary', bg: 'bg-primary' },
  idle: { label: 'Idle', icon: '○', badge: 'text-bg-secondary', border: 'border-secondary', btn: 'btn-secondary', btnOutline: 'btn-outline-secondary', bg: 'bg-secondary' },
  done: { label: 'Done', icon: '✓', badge: 'text-bg-success', border: 'border-success', btn: 'btn-success', btnOutline: 'btn-outline-success', bg: 'bg-success' },
}
