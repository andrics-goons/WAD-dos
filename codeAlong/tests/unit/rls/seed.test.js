// @vitest-environment node
// Checks supabase/seed.sql: the documented accounts work, and the seeded data says what
// design-docs/07-seed-and-demo.md promises. Skipped when the database hasn't been seeded
// (run `pnpm exec supabase db reset` first).
import { describe, it, expect, beforeAll } from 'vitest'
import { anonClient, service } from './_helpers.js'

const PASSWORD = 'pass1234'
const uid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const course = (n) => `00000000-0000-0000-0001-${String(n).padStart(12, '0')}`
const session = (n) => `00000000-0000-0000-0004-${String(n).padStart(12, '0')}`
const COURSE = course(1) // IS216 G2, the demo course
const ARCHIVED = course(2) // last term's IS216 G2
const TAN_COURSE = course(3)
const PAST = session(1) // Week 6 · Mini Cart, 12 Oct (MNCART)
const LIVE = session(4) // CART42
const WEEK5 = session(5) // Week 5 · Grade Book, 5 Oct (GRADE5)

// 07's user table: [#, email, role]
const STUDENTS = [
  [4, 'alex'],
  [5, 'bea'],
  [6, 'chen'],
  [7, 'dana'],
  [8, 'eli'],
  [9, 'faye'],
  [10, 'gus'],
  [11, 'hana'],
  [12, 'ivan'],
  [13, 'jae'],
  [14, 'kim'],
  [15, 'zoe'],
  [18, 'lucas'],
  [19, 'mei'],
  [20, 'nadia'],
  [21, 'omar'],
  [22, 'priya'],
  [23, 'quinn'],
  [24, 'rachel'],
  [25, 'sam'],
  [26, 'tara'],
  [27, 'uma'],
  [28, 'victor'],
  [29, 'wenhui'],
]
const ACCOUNTS = [
  [1, 'prof@codealong.test', 'prof'],
  [2, 'ta.ana@codealong.test', 'ta'],
  [3, 'ta.ben@codealong.test', 'ta'],
  ...STUDENTS.map(([n, name]) => [n, `${name}@codealong.test`, 'student']),
  [16, 'prof.tan@codealong.test', 'prof'],
  [17, 'admin@codealong.test', 'admin'],
]
// the live class's two idle students, last seen over an hour ago
const IDLE = [uid(7), uid(24)]

const { data: seeded } = await service.from('profiles').select('id').eq('id', uid(29))
const isSeeded = seeded?.length === 1

async function login(email) {
  const client = anonClient()
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw error
  return client
}

const ids = (rows) => rows.map((r) => r.id).sort()
const count = (rows, fn) => rows.filter(fn).length

describe.skipIf(!isSeeded)('seed.sql', () => {
  let prof, ana, alex, zoe, tan

  beforeAll(async () => {
    ;[prof, ana, alex, zoe, tan] = await Promise.all(
      ['prof', 'ta.ana', 'alex', 'zoe', 'prof.tan'].map((u) => login(`${u}@codealong.test`)),
    )
    // The live class's students go idle an hour after a reset: a heartbeat keeps these checks
    // honest, and the two meant to be idle are put back over the hour
    const ago = (mins) => new Date(Date.now() - mins * 60_000).toISOString()
    await service
      .from('student_status')
      .update({ last_seen_at: ago(0) })
      .eq('session_id', LIVE)
    await service
      .from('student_status')
      .update({ last_seen_at: ago(70) })
      .eq('session_id', LIVE)
      .in('student_id', IDLE)
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
    it("Prof Lee sees his five courses, never Prof Tan's", async () => {
      const { data } = await prof.from('courses').select('id')
      expect(ids(data)).toEqual([COURSE, ARCHIVED, course(4), course(5), course(6)].sort())
    })

    it("Prof Tan sees his own course and the one he's a TA in, none of Prof Lee's others (T-PLAT-15)", async () => {
      const { data } = await tan.from('courses').select('id')
      expect(ids(data)).toEqual([TAN_COURSE, course(4)].sort())
    })

    it('Alex sees his two courses; Zoe, not enrolled, sees none', async () => {
      expect(ids((await alex.from('courses').select('id')).data)).toEqual(
        [COURSE, course(4)].sort(),
      )
      expect((await zoe.from('courses').select('id')).data).toEqual([])
    })

    it('the demo course has 23 students and 2 TAs, and the documented enrol code', async () => {
      const students = await prof.from('course_students').select('user_id').eq('course_id', COURSE)
      const staff = await prof.from('course_staff').select('role').eq('course_id', COURSE)
      const { data } = await prof.from('courses').select('enrol_code').eq('id', COURSE).single()
      expect(students.data).toHaveLength(23)
      expect(count(staff.data, (s) => s.role === 'ta')).toBe(2)
      expect(data.enrol_code).toBe('WAD2G2')
    })

    it("the demo course is the oldest of Prof Lee's four active ones (only the live class keeps it on Home)", async () => {
      const { data } = await prof
        .from('courses')
        .select('id, archived')
        .eq('archived', false)
        .order('created_at', { ascending: false })
      expect(data).toHaveLength(4)
      expect(data.at(-1).id).toBe(COURSE)
    })
  })

  describe('the lesson library', () => {
    it('has folders for Weeks 3 to 7, two files in Week 6, and one with no week', async () => {
      const { data } = await prof
        .from('lessons')
        .select('title, week, status')
        .eq('course_id', COURSE)
      expect(data).toHaveLength(7)
      expect(count(data, (l) => l.week === 6)).toBe(2)
      expect(count(data, (l) => l.week === null)).toBe(1)
      expect(new Set(data.map((l) => l.status))).toEqual(new Set(['ready', 'draft', 'archived']))
    })

    it('students never see the draft', async () => {
      const { data } = await alex.from('lessons').select('status').eq('course_id', COURSE)
      expect(data.length).toBeGreaterThan(0)
      expect(data.some((l) => l.status === 'draft')).toBe(false)
    })

    it('Mini Cart is ready, with its starter files', async () => {
      const { data } = await alex
        .from('lessons')
        .select('status, entry_file, files')
        .eq('id', '00000000-0000-0000-0002-000000000001')
        .single()
      expect(data.status).toBe('ready')
      expect(data.entry_file).toBe('index.html')
      expect(data.files.map((f) => f.path)).toEqual(
        expect.arrayContaining(['server/api.js', 'src/ca-probe.js']),
      )
    })
  })

  describe('T-SEED-03: the Week 6 replay (MNCART) has what replay and the report need', () => {
    it('8 titled checkpoints whose code grows one change at a time', async () => {
      const { data } = await alex
        .from('checkpoints')
        .select('seq, title, files_hash')
        .eq('session_id', PAST)
        .order('seq')
      expect(data.map((c) => c.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
      expect(data[3].title).toBe('Emit add-to-cart — props.items in the script, not items!')
      expect(new Set(data.map((c) => c.files_hash)).size).toBe(8) // every checkpoint differs
    })

    it('20 students: 16 Done on the last checkpoint, 4 never caught up after checkpoint 6', async () => {
      const { data } = await prof.from('session_tiles').select('done_seq').eq('session_id', PAST)
      expect(data).toHaveLength(20)
      expect(count(data, (t) => t.done_seq === 8)).toBe(16)
      expect(count(data, (t) => t.done_seq === 6)).toBe(4)
    })

    it('7 help requests: 3 passed checks, 3 replied (with AI analyses), 1 resolved in person', async () => {
      const { data } = await ana
        .from('help_requests')
        .select('type, status, in_person, analysis')
        .eq('session_id', PAST)
      expect(data).toHaveLength(7)
      expect(count(data, (r) => r.type === 'check' && r.status === 'passed')).toBe(3)
      expect(count(data, (r) => r.status === 'replied' && r.analysis?.category)).toBe(3)
      expect(count(data, (r) => r.status === 'resolved' && r.in_person)).toBe(1)
    })

    it("notes are their writer's alone: Alex sees his 2, the prof only his own", async () => {
      const mine = await alex.from('notes').select('user_id').eq('session_id', PAST)
      const staff = await prof.from('notes').select('user_id').eq('session_id', PAST)
      expect(mine.data).toHaveLength(2)
      expect(mine.data.every((n) => n.user_id === uid(4))).toBe(true)
      expect(staff.data).toEqual([{ user_id: uid(1) }])
    })

    it('the report, built from the history, makes checkpoint 4 the top trouble spot', async () => {
      const { data } = await prof
        .from('session_reports')
        .select('*')
        .eq('session_id', PAST)
        .single()
      const top = [...data.checkpoints].sort((a, b) => b.trouble - a.trouble)[0]
      expect(data.attendance).toEqual({ joined: 20, enrolled: 23 })
      expect(top.seq).toBe(4)
      expect(top.errorStudents).toBe(9)
      // 4 of the 9 got past it by loading checkpoint 4, so that's where they needed the prof's code
      expect(data.checkpoints[3].catchUps).toBe(4)
      expect(data.checkpoints[6]).toMatchObject({ dropOff: 4, catchUps: 3 }) // checkpoint 7
      expect(data.top_errors[0]).toMatchObject({
        key: 'ReferenceError: items is not defined',
        students: 9,
      })
      expect(data.slow_down_peak).toBe(4)
    })
  })

  describe('the Week 5 replay (GRADE5)', () => {
    it('5 checkpoints and 21 students, with their autosaves for the student view', async () => {
      const cps = await alex.from('checkpoints').select('seq').eq('session_id', WEEK5)
      const tiles = await prof.from('session_tiles').select('done_seq').eq('session_id', WEEK5)
      const mine = await alex.from('snapshots').select('reason').eq('session_id', WEEK5)
      expect(cps.data).toHaveLength(5)
      expect(tiles.data).toHaveLength(21)
      expect(mine.data.map((s) => s.reason)).toContain('autosave')
    })

    it('its report makes checkpoint 3 (s.score for s.scores) the top trouble spot', async () => {
      const { data } = await prof
        .from('session_reports')
        .select('*')
        .eq('session_id', WEEK5)
        .single()
      const top = [...data.checkpoints].sort((a, b) => b.trouble - a.trouble)[0]
      expect(data.attendance).toEqual({ joined: 21, enrolled: 23 })
      expect(top).toMatchObject({ seq: 3, errorStudents: 7, catchUps: 3 })
      expect(data.checkpoints[4].dropOff).toBe(3) // checkpoint 5
    })

    it("Prof Lee reads his classes' reports and last term's, never Prof Tan's", async () => {
      const { data } = await prof.from('session_reports').select('session_id')
      expect(data.map((r) => r.session_id).sort()).toEqual([PAST, session(2), WEEK5].sort())
    })
  })

  describe('who reads student code on the seeded data', () => {
    it("T-PRIV-02/03: a TA reads every student's code in the class (34 snapshots in Week 6)", async () => {
      const { data } = await ana.from('snapshots').select('reason').eq('session_id', PAST)
      expect(data).toHaveLength(34) // 20 autosaves, 7 from before a catch-up, 7 sent for help
    })

    it("a student can't read a classmate's code", async () => {
      const { data } = await alex.from('snapshots').select('student_id').eq('session_id', PAST)
      expect(data.length).toBeGreaterThan(0)
      expect(data.every((s) => s.student_id === uid(4))).toBe(true)
    })
  })

  describe('the live class (CART42)', () => {
    it('21 students on checkpoint 3: 8 Done, 5 in progress, 6 with errors, 2 idle', async () => {
      const { data } = await ana.from('session_tiles').select('state').eq('session_id', LIVE)
      expect(data).toHaveLength(21)
      expect(count(data, (t) => t.state === 'done')).toBe(8)
      expect(count(data, (t) => t.state === 'in_progress')).toBe(5)
      expect(count(data, (t) => t.state === 'error')).toBe(6)
      expect(count(data, (t) => t.state === 'idle')).toBe(2)
    })

    it('the errors group the way Common errors groups them: one shape has two spellings', async () => {
      const { data } = await ana
        .from('session_tiles')
        .select('error_key, error_shape_key')
        .eq('session_id', LIVE)
        .not('error_key', 'is', null)
      const shapes = Object.groupBy(data, (t) => t.error_shape_key)
      const sizes = Object.values(shapes)
        .map((g) => g.length)
        .sort()
      expect(sizes).toEqual([1, 2, 3]) // the import typo ×3, the missing prop ×2, one on its own
      const imports = Object.values(shapes).find((g) => g.length === 3)
      expect(new Set(imports.map((t) => t.error_key)).size).toBe(2) // Itemcard and itemcard
    })

    it('the help queue has every state: waiting, claimed, a follow-up, in person, and handled', async () => {
      const { data } = await ana
        .from('help_requests')
        .select('type, status, in_person, follow_ups, analysis')
        .eq('session_id', LIVE)
      expect(data).toHaveLength(10)
      expect(count(data, (r) => r.status === 'open')).toBe(6)
      expect(count(data, (r) => r.status === 'claimed')).toBe(1)
      expect(count(data, (r) => r.follow_ups === 1 && r.status === 'open')).toBe(1)
      expect(count(data, (r) => r.in_person && r.status === 'open')).toBe(1)
      expect(count(data, (r) => r.analysis?.status === 'failed')).toBe(1)
      // help requests the AI has read, for "What the class is stuck on"
      expect(count(data, (r) => r.analysis?.category === 'wrong-import')).toBe(2)
    })

    it('three students asked to slow down, and staff only ever see the count', async () => {
      const { data } = await ana
        .from('session_summary')
        .select('slow_down_count')
        .eq('session_id', LIVE)
        .single()
      expect(data.slow_down_count).toBe(3)
      const flags = await ana.from('slow_down_flags').select('student_id').eq('session_id', LIVE)
      expect(flags.data).toEqual([])
    })

    it('Alex can join it: it is live, he is enrolled, and there is an announcement', async () => {
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
