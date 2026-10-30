// Hard-coded sample data for the report page, until session_reports has real data.
// Nothing here is fetched: the shapes only mimic what session_reports will return later.

export const lesson = {
  id: 'demo',
  title: 'Week 6 · Mini Cart',
  course: 'IS216 · G2',
  joinCode: 'K7QX2M',
}

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
