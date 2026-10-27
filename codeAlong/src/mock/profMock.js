// Hard-coded sample data for the prof-view wireframes. Nothing here is fetched:
// the shapes only mimic what session_tiles / checkpoints / session_reports will return later.

import { normalizeError } from '@shared/error-normalizer.js'

export const lesson = {
  id: 'demo',
  title: 'Week 6 · Mini Cart',
  course: 'IS216 · G2',
  joinCode: 'K7QX2M',
}

// the checkpoints the prof has saved so far, newest last
export const checkpoints = [
  { seq: 1, title: 'ItemCard props', savedAt: '10:12' },
  { seq: 2, title: 'Emit add-to-cart', savedAt: '10:24' },
  { seq: 3, title: null, savedAt: '10:31' },
  { seq: 4, title: 'Handle the add event', savedAt: '10:40' },
]

// state: a TileState value from @shared/constants.js (error | in_progress | idle | done)
const rawStudents = [
  {
    id: 1,
    name: 'Aisha Rahman',
    state: 'error',
    error: { name: 'TypeError', message: "Cannot read properties of undefined (reading 'price')" },
  },
  {
    id: 2,
    name: 'Ben Tan',
    state: 'error',
    error: { name: 'TypeError', message: "Cannot read properties of undefined (reading 'price')" },
  },
  { id: 3, name: 'Chloe Lim', state: 'in_progress' },
  { id: 4, name: 'Daniel Ong', state: 'in_progress' },
  { id: 5, name: 'Eli Koh', state: 'in_progress' },
  { id: 6, name: 'Farah Yusof', state: 'done' },
  { id: 7, name: 'Gavin Teo', state: 'in_progress' },
  {
    id: 8,
    name: 'Hana Seah',
    state: 'error',
    error: { name: 'ReferenceError', message: "'axios' is not defined" },
  },
  { id: 9, name: 'Ian Chua', state: 'in_progress' },
  { id: 10, name: 'Jia Wen', state: 'idle' },
  { id: 11, name: 'Kai Ng', state: 'in_progress' },
  { id: 12, name: 'Lena Goh', state: 'in_progress' },
  { id: 13, name: 'Marcus Wee', state: 'done' },
  {
    id: 14,
    name: 'Nadia Pang',
    state: 'error',
    error: { name: 'TypeError', message: "Cannot read properties of undefined (reading 'price')" },
  },
  { id: 15, name: 'Owen Lee', state: 'in_progress' },
  { id: 16, name: 'Priya Nair', state: 'idle' },
  { id: 17, name: 'Quinn Sim', state: 'done' },
  { id: 18, name: 'Ravi Menon', state: 'in_progress' },
  { id: 19, name: 'Sara Ho', state: 'in_progress' },
  { id: 20, name: 'Tom Yeo', state: 'in_progress' },
  { id: 21, name: 'Uma Das', state: 'done' },
  { id: 22, name: 'Victor Lau', state: 'idle' },
  {
    id: 23,
    name: 'Wendy Chia',
    state: 'error',
    error: { name: 'SyntaxError', message: 'Unexpected token (14:8)', source: 'build' },
  },
  { id: 24, name: 'Xavier Ang', state: 'in_progress' },
]

// add the error fields session_tiles will have, using the same normalizeError the students' browsers will run
export const students = rawStudents.map(({ error, ...s }) => {
  const { key, shapeKey } = error ? normalizeError(error) : {}
  return {
    ...s,
    studentId: s.id,
    note: error?.message ?? '',
    errorKey: key ?? null,
    errorShapeKey: shapeKey ?? null,
    errorSource: error ? (error.source ?? 'runtime') : null,
    errorPreview: error?.message ?? null,
    lastSeenAt: '2026-10-17T10:00:00Z',
  }
})

export const slowDownCount = 3

// no fake error groups here, TeachView works them out from the students with groupErrors()

export const report = {
  attended: 24,
  // students who clicked Done on each checkpoint
  funnel: [
    { seq: 1, title: 'ItemCard props', done: 24 },
    { seq: 2, title: 'Emit add-to-cart', done: 24 },
    { seq: 3, title: 'Fetch items with axios', done: 22 },
    { seq: 4, title: 'Handle the add event', done: 19 },
    { seq: 5, title: 'Computed cart total', done: 11 },
    { seq: 6, title: null, done: 8 },
    { seq: 7, title: 'Persist to localStorage', done: 5 },
    { seq: 8, title: 'POST the order to the API', done: 3 },
  ],
  topErrors: [
    { message: "Cannot read properties of undefined (reading 'price')", count: 13, seq: 4 },
    { message: "'axios' is not defined", count: 7, seq: 3 },
    { message: 'Unexpected token', count: 4, seq: 5 },
    { message: 'Network Error (ECONNREFUSED)', count: 3, seq: 8 },
  ],
  recurring: [
    { checkpoint: 'Handle the add event', terms: '3 of last 4 terms', dropOff: '21%' },
    { checkpoint: 'Computed cart total', terms: '2 of last 4 terms', dropOff: '42%' },
  ],
  helpRequests: 9,
  avgWaitMin: 4,
}
