// @vitest-environment node
// session_slow_down_count: "Slow down" counts only the students who are still here (seen within
// the class's idle window), and only as a number.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { userClient, service, cleanup } from './_helpers.js'

const file = (content) => [{ path: 'index.html', language: 'html', content }]
let prof, ta, ana, ben, cal, course, session

const countAs = async (who, id = session.id) =>
  (await who.client.rpc('session_slow_down_count', { sid: id })).data
// a student last seen this many seconds ago (the service role keeps the time it sets)
const seenAgo = (who, secs) =>
  service
    .from('student_status')
    .update({ last_seen_at: new Date(Date.now() - secs * 1000).toISOString() })
    .eq('session_id', session.id)
    .eq('student_id', who.id)

beforeAll(async () => {
  ;[prof, ta, ana, ben, cal] = await Promise.all([
    userClient({ name: 'Prof Lee', role: 'prof' }),
    userClient({ name: 'Tia Ta' }),
    userClient({ name: 'Ana' }),
    userClient({ name: 'Ben' }),
    userClient({ name: 'Cal' }),
  ])
  const { data: c } = await prof.client.rpc('create_course', {
    p_code: 'IS216',
    p_title: 'WAD II',
    p_term: 'T1',
    p_section: 'G1',
  })
  course = c
  await prof.client.rpc('add_course_staff', { p_course_id: c.id, p_email: ta.email })
  for (const who of [ana, ben, cal])
    await who.client.rpc('enrol_with_code', { p_code: c.enrol_code })
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
  ;({ data: session } = await prof.client.rpc('start_session', { p_lesson_id: lesson.id }))
  // all three join and ask the prof to slow down
  for (const who of [ana, ben, cal]) {
    await who.client
      .from('student_status')
      .upsert({ session_id: session.id, student_id: who.id, done_seq: null })
    await who.client.from('slow_down_flags').insert({ session_id: session.id, student_id: who.id })
  }
}, 60_000)

afterAll(async () => {
  await service.from('sessions').delete().eq('course_id', course.id)
  await service.from('courses').delete().eq('id', course.id)
  await cleanup()
})

describe('session_slow_down_count', () => {
  it('T-DASH-11: counts every flag while everyone is here', async () => {
    expect(await countAs(prof)).toBe(3)
  })

  it('T-DASH-11: stops counting a student who has not been seen for longer than the idle window', async () => {
    await seenAgo(ben, 600) // gone for ten minutes (the window is 180 s)
    expect(await countAs(prof)).toBe(2)
    expect(await countAs(ta)).toBe(2) // TAs read the same number
    await seenAgo(cal, 120) // two minutes: still within the window
    expect(await countAs(prof)).toBe(2)
  })

  it('their flag counts again when they come back (the heartbeat stamps the server time)', async () => {
    await ben.client.from('student_status').update({ done_seq: null }).eq('session_id', session.id)
    expect(await countAs(prof)).toBe(3)
  })

  it("follows the class's own idle window", async () => {
    const { error } = await prof.client
      .from('sessions')
      .update({ settings: { allowCatchUp: true, hintsEnabled: false, idleAfterSec: 30 } })
      .eq('id', session.id)
    expect(error).toBeNull()
    await seenAgo(cal, 120)
    expect(await countAs(prof)).toBe(2) // two minutes is past a 30 s window now
  })

  it('stays a count: students and outsiders get null, and nothing says who', async () => {
    expect(await countAs(ana)).toBeNull()
    const { data } = await prof.client.from('slow_down_flags').select('student_id')
    expect(data).toEqual([]) // staff can't read the rows at all
  })

  it('an ended class keeps every flag (nobody is "here" any more)', async () => {
    await seenAgo(ana, 3600)
    await prof.client.rpc('end_session', { p_session_id: session.id })
    expect(await countAs(prof)).toBe(3)
  })
})
