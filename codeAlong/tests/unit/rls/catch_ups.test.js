// @vitest-environment node
// Catch-ups in the end-of-class report (design-docs/05 §10): a student loading the prof's latest
// checkpoint is logged at that checkpoint, counted in the report and in the trouble score.
// Plus each checkpoint's slow-down peak: the most students asking at once while it was the latest.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { userClient, service, cleanup } from './_helpers.js'

const file = (content) => [{ path: 'index.html', language: 'html', content }]

let prof, ana, ben, course, session, report

// what the workspace sends after "Load latest checkpoint": my new catch-up count
const catchUp = (who, count) =>
  who.client
    .from('student_status')
    .update({ catch_ups: count })
    .eq('session_id', session.id)
    .eq('student_id', who.id)
    .then(({ error }) => {
      if (error) throw error
    })

const history = async (who) =>
  (
    await service
      .from('status_history')
      .select('state, checkpoint_seq')
      .eq('session_id', session.id)
      .eq('student_id', who.id)
      .order('id')
  ).data

beforeAll(async () => {
  ;[prof, ana, ben] = await Promise.all([
    userClient({ name: 'Prof Lee', role: 'prof' }),
    userClient({ name: 'Ana' }),
    userClient({ name: 'Ben' }),
  ])
  const { data: c, error } = await prof.client.rpc('create_course', {
    p_code: 'IS216',
    p_title: 'WAD II',
    p_term: 'AY2026/27 T1',
    p_section: 'G8',
  })
  if (error) throw error
  course = c
  for (const who of [ana, ben]) await who.client.rpc('enrol_with_code', { p_code: c.enrol_code })
  const { data: lesson } = await prof.client
    .from('lessons')
    .insert({
      course_id: c.id,
      title: 'Week 6',
      files: file('start'),
      entry_file: 'index.html',
      status: 'ready',
    })
    .select()
    .single()

  // two students join; checkpoint 1: Ana loads it once and asks to slow down. Checkpoint 2: Ben
  // loads it twice and asks too (the peak: 2 at once), then Ana takes hers back
  session = (await prof.client.rpc('start_session', { p_lesson_id: lesson.id })).data
  for (const who of [ana, ben]) {
    await who.client.from('student_status').upsert({ session_id: session.id, student_id: who.id })
  }
  const save = (n) =>
    prof.client.rpc('save_checkpoint', {
      p_session_id: session.id,
      p_files: file(String(n)),
      p_title: `Step ${n}`,
    })
  const slowDown = (who) =>
    who.client.from('slow_down_flags').insert({ session_id: session.id, student_id: who.id })
  await save(1)
  await catchUp(ana, 1)
  await slowDown(ana)
  await save(2)
  await catchUp(ben, 1)
  await catchUp(ben, 2)
  await slowDown(ben)
  await ana.client
    .from('slow_down_flags')
    .delete()
    .eq('session_id', session.id)
    .eq('student_id', ana.id)

  const { error: endError } = await prof.client.rpc('end_session', { p_session_id: session.id })
  if (endError) throw endError
  report = (await service.from('session_reports').select('*').eq('session_id', session.id).single())
    .data
}, 60_000)

afterAll(async () => {
  if (course) await service.from('sessions').delete().eq('course_id', course.id)
  if (course) await service.from('courses').delete().eq('id', course.id)
  await cleanup()
})

describe('catch-ups', () => {
  it('each "Load latest checkpoint" is logged at the checkpoint the class was on', async () => {
    expect((await history(ana)).filter((h) => h.state === 'catch_up')).toEqual([
      { state: 'catch_up', checkpoint_seq: 1 },
    ])
    expect((await history(ben)).filter((h) => h.state === 'catch_up')).toEqual([
      { state: 'catch_up', checkpoint_seq: 2 },
      { state: 'catch_up', checkpoint_seq: 2 },
    ])
  })

  it("a catch-up does not log the student's status twice", async () => {
    // one in_progress row when Ben joined; the catch-ups in between don't make it look new
    expect((await history(ben)).filter((h) => h.state === 'in_progress')).toHaveLength(1)
  })

  it('T-INS-09: the report counts the students per checkpoint, without touching the trouble score', () => {
    const [one, two] = report.checkpoints
    expect(one).toMatchObject({ seq: 1, catchUps: 1 })
    expect(two).toMatchObject({ seq: 2, catchUps: 1 }) // Ben loaded it twice: one student
    // nobody had errors, dropped off or asked for help, and catch-ups aren't part of the score
    expect(one.trouble).toBe(0)
    expect(two.trouble).toBe(0)
  })

  it('T-INS-10: each checkpoint has its own slow-down peak', () => {
    const [one, two] = report.checkpoints
    expect(one.slowDownPeak).toBe(1) // Ana
    expect(two.slowDownPeak).toBe(2) // Ana's flag was still up when Ben asked
    expect(report.slow_down_peak).toBe(2)
  })

  it('a student can only count their own catch-ups', async () => {
    const { data } = await ana.client
      .from('student_status')
      .update({ catch_ups: 9 })
      .eq('session_id', session.id)
      .eq('student_id', ben.id)
      .select()
    expect(data).toEqual([])
  })
})
