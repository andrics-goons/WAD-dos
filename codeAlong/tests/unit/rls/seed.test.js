// @vitest-environment node
// Checks supabase/seed.sql: the documented accounts work, and the seeded data says what
// design-docs/07-seed-and-demo.md promises. Skipped when the database hasn't been seeded
// (run `pnpm exec supabase db reset` first).
import { describe, it, expect, beforeAll } from 'vitest'
import { anonClient, service } from './_helpers.js'

const PASSWORD = 'pass1234'
const uid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const COURSE = '00000000-0000-0000-0001-000000000001'
const ARCHIVED = '00000000-0000-0000-0001-000000000002'
const TAN_COURSE = '00000000-0000-0000-0001-000000000003'
const PAST = '00000000-0000-0000-0004-000000000001'
const LIVE = '00000000-0000-0000-0004-000000000004'

// 07's user table: [#, email, role]
const ACCOUNTS = [
  [1, 'prof@codealong.test', 'prof'],
  [2, 'ta.ana@codealong.test', 'ta'],
  [3, 'ta.ben@codealong.test', 'ta'],
  [4, 'alex@codealong.test', 'student'],
  [5, 'bea@codealong.test', 'student'],
  [6, 'chen@codealong.test', 'student'],
  [7, 'dana@codealong.test', 'student'],
  [8, 'eli@codealong.test', 'student'],
  [9, 'faye@codealong.test', 'student'],
  [10, 'gus@codealong.test', 'student'],
  [11, 'hana@codealong.test', 'student'],
  [12, 'ivan@codealong.test', 'student'],
  [13, 'jae@codealong.test', 'student'],
  [14, 'kim@codealong.test', 'student'],
  [15, 'zoe@codealong.test', 'student'],
  [16, 'prof.tan@codealong.test', 'prof'],
  [17, 'admin@codealong.test', 'admin'],
]

const { data: seeded } = await service.from('profiles').select('id').eq('id', uid(1))
const isSeeded = seeded?.length === 1

async function login(email) {
  const client = anonClient()
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw error
  return client
}

const ids = (rows) => rows.map((r) => r.id).sort()

describe.skipIf(!isSeeded)('seed.sql', () => {
  let prof, ana, alex, zoe, tan

  beforeAll(async () => {
    ;[prof, ana, alex, zoe, tan] = await Promise.all(
      ['prof', 'ta.ana', 'alex', 'zoe', 'prof.tan'].map((u) => login(`${u}@codealong.test`)),
    )
    // The live tiles go idle an hour after a reset; a heartbeat keeps these checks honest.
    await service
      .from('student_status')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('session_id', LIVE)
  })

  it.each(ACCOUNTS)(
    'T-SEED-02: user %i (%s) logs in with the documented password as %s',
    async (n, email, role) => {
      const client = await login(email)
      const { data } = await client.from('profiles').select('id, role').eq('id', uid(n)).single()
      expect(data).toEqual({ id: uid(n), role })
    },
  )

  describe('who sees which course', () => {
    it("Prof Lee sees both his terms, never Prof Tan's course", async () => {
      const { data } = await prof.from('courses').select('id')
      expect(ids(data)).toEqual([COURSE, ARCHIVED].sort())
    })

    it('Prof Tan sees only his own course (T-PLAT-15)', async () => {
      const { data } = await tan.from('courses').select('id')
      expect(ids(data)).toEqual([TAN_COURSE])
    })

    it('Alex sees the current course; Zoe, not enrolled, sees none', async () => {
      expect(ids((await alex.from('courses').select('id')).data)).toEqual([COURSE])
      expect((await zoe.from('courses').select('id')).data).toEqual([])
    })

    it('the documented enrol code is WAD2G2', async () => {
      const { data } = await prof.from('courses').select('enrol_code').eq('id', COURSE).single()
      expect(data.enrol_code).toBe('WAD2G2')
    })
  })

  describe('the lesson', () => {
    it('is ready, with the 8 Mini Cart steps and their TODO locations', async () => {
      const { data } = await alex
        .from('lessons')
        .select('status, entry_file, files, steps(order, title, todo_refs)')
        .eq('course_id', COURSE)
        .single()
      const steps = data.steps.sort((a, b) => a.order - b.order)
      expect(data.status).toBe('ready')
      expect(data.files.map((f) => f.path)).toContain('server/api.js')
      expect(steps).toHaveLength(8)
      expect(steps[3].title).toBe('Emit add-to-cart from ItemCard')
      expect(steps[2].todo_refs.map((r) => r.file)).toEqual([
        'src/App.vue',
        'src/components/ItemCard.vue',
      ])
    })
  })

  describe('T-SEED-03: the past session has what replay and the report need', () => {
    it('8 checkpoints whose code grows step by step', async () => {
      const { data } = await alex
        .from('checkpoints')
        .select('seq, files_hash')
        .eq('session_id', PAST)
        .order('seq')
      expect(data.map((c) => c.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
      expect(new Set(data.map((c) => c.files_hash)).size).toBe(8) // every checkpoint differs
    })

    it('11 students: 8 finished, 3 behind', async () => {
      const { data } = await prof.from('session_tiles').select('step_order').eq('session_id', PAST)
      const done = data.filter((t) => t.step_order === 8).length
      expect(data).toHaveLength(11)
      expect(done).toBe(8)
    })

    it('5 help requests: 2 passed checks, 2 replied, 1 resolved in person', async () => {
      const { data } = await ana
        .from('help_requests')
        .select('type, status, in_person')
        .eq('session_id', PAST)
      const count = (fn) => data.filter(fn).length
      expect(data).toHaveLength(5)
      expect(count((r) => r.type === 'check' && r.status === 'passed')).toBe(2)
      expect(count((r) => r.status === 'replied')).toBe(2)
      expect(count((r) => r.status === 'resolved' && r.in_person)).toBe(1)
    })

    it("Alex's 4 notes are his alone", async () => {
      const mine = await alex.from('notes').select('id').eq('session_id', PAST)
      const staff = await prof.from('notes').select('id').eq('session_id', PAST)
      expect(mine.data).toHaveLength(4)
      expect(staff.data).toEqual([])
    })

    it('the report makes step 4 the top trouble step, with the history behind it', async () => {
      const { data } = await prof
        .from('session_reports')
        .select('*')
        .eq('session_id', PAST)
        .single()
      const top = [...data.steps].sort((a, b) => b.trouble - a.trouble)[0]
      expect(data.attendance).toEqual({ joined: 11, enrolled: 11 })
      expect(top.order).toBe(4)
      expect(top.errorStudents).toBe(6)
      expect(data.steps[6].dropOff).toBe(3) // three never finish step 7
      expect(data.top_errors[0]).toMatchObject({
        key: 'ReferenceError: items is not defined',
        students: 6,
      })
      expect(data.lost_peak).toBe(3)
    })

    it("Prof Lee reads last term's report, never Prof Tan's", async () => {
      const { data } = await prof.from('session_reports').select('session_id')
      expect(data.map((r) => r.session_id).sort()).toEqual(
        [PAST, '00000000-0000-0000-0004-000000000002'].sort(),
      )
    })
  })

  describe('privacy holds on the seeded data', () => {
    it('T-PRIV-02/03: a TA reads the 5 sent snapshots and none of the autosaves', async () => {
      const { data } = await ana.from('snapshots').select('reason').eq('session_id', PAST)
      expect(data).toHaveLength(5)
      expect(data.every((s) => s.reason === 'help_request')).toBe(true)
    })

    it("a student can't read a classmate's code", async () => {
      const { data } = await alex.from('snapshots').select('student_id').eq('session_id', PAST)
      expect(data.every((s) => s.student_id === uid(4))).toBe(true)
    })
  })

  describe('the live session (CART42)', () => {
    it('shows one of each tile state', async () => {
      const { data } = await ana
        .from('session_tiles')
        .select('student_id, state')
        .eq('session_id', LIVE)
      const byStudent = Object.fromEntries(data.map((t) => [t.student_id, t.state]))
      expect(byStudent).toEqual({
        [uid(4)]: 'done',
        [uid(8)]: 'done',
        [uid(6)]: 'in_progress',
        [uid(5)]: 'error',
        [uid(7)]: 'behind',
      })
    })

    it("has Bea's open help request in the queue and one anonymous lost", async () => {
      const queue = await ana.from('help_requests').select('status').eq('session_id', LIVE)
      const summary = await ana
        .from('session_summary')
        .select('lost_count')
        .eq('session_id', LIVE)
        .single()
      expect(queue.data).toEqual([{ status: 'open' }])
      expect(summary.data.lost_count).toBe(1)
    })

    it('Alex can join it: it is live and he is enrolled', async () => {
      const { data } = await alex
        .from('sessions')
        .select('join_code, status, announcement')
        .eq('id', LIVE)
        .single()
      expect(data).toMatchObject({ join_code: 'CART42', status: 'live' })
      expect(data.announcement.text).toMatch(/import paths/)
    })
  })
})
