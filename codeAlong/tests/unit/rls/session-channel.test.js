// @vitest-environment node
// Who may listen to a class's live channel (session:<id>). The realtime.messages policy
// only lets members of the class's course in; everyone else is refused and hears nothing.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { anonClient, userClient, service, cleanup } from './_helpers.js'
import { generateJoinCode } from '@shared/join-code.js'

let prof, stu, stu2, outsider, course, session

// Try to join the channel. Resolves with how it went ('SUBSCRIBED' or 'CHANNEL_ERROR'), the
// error message if refused, and `heard`, which turns true if any broadcast arrives afterwards.
// Realtime takes about 5 s to refuse, so the tests below get 20 s.
async function tryJoin(client, sessionId) {
  const channel = client.channel(`session:${sessionId}`, { config: { private: true } })
  const result = { heard: false, channel }
  channel.on('broadcast', { event: '*' }, () => (result.heard = true))
  await new Promise((resolve) => {
    const timer = setTimeout(() => resolve((result.status = 'TIMED_OUT')), 15_000)
    channel.subscribe((status, err) => {
      if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR') {
        clearTimeout(timer)
        result.status = status
        result.error = err?.message
        resolve()
      }
    })
  })
  return result
}

// The prof flips a setting (keeping the rest), which broadcasts session:settings to the class
async function broadcastSomething() {
  session.settings = { ...session.settings, hintsEnabled: !session.settings.hintsEnabled }
  const { error } = await prof.client
    .from('sessions')
    .update({ settings: session.settings })
    .eq('id', session.id)
  if (error) throw error
  await new Promise((resolve) => setTimeout(resolve, 2000))
}

beforeAll(async () => {
  ;[prof, stu, stu2, outsider] = await Promise.all([
    userClient({ name: 'Prof Lee', role: 'prof' }),
    userClient({ name: 'Stu Dent' }),
    userClient({ name: 'Second Stu' }),
    userClient({ name: 'Out Sider' }),
  ])

  const { data, error } = await prof.client.rpc('create_course', {
    p_code: 'IS216',
    p_title: 'WAD II',
    p_term: 'AY2026/27 T1',
    p_section: 'G2',
  })
  if (error) throw error
  course = data
  await stu.client.rpc('enrol_with_code', { p_code: course.enrol_code })
  await stu2.client.rpc('enrol_with_code', { p_code: course.enrol_code })

  const lesson = await prof.client
    .from('lessons')
    .insert({
      course_id: course.id,
      title: 'Week 6',
      files: [{ path: 'index.html', language: 'html', content: '<div id="app"></div>' }],
      entry_file: 'index.html',
    })
    .select()
    .single()
  if (lesson.error) throw lesson.error

  // a live class, made directly so these tests only depend on the channel policy
  const live = await service
    .from('sessions')
    .insert({
      lesson_id: lesson.data.id,
      course_id: course.id,
      started_by: prof.id,
      join_code: generateJoinCode(),
    })
    .select()
    .single()
  if (live.error) throw live.error
  session = live.data
}, 30_000)

afterAll(async () => {
  await service.from('sessions').delete().eq('course_id', course.id)
  await service.from('courses').delete().eq('id', course.id)
  await cleanup()
})

describe('session channel access', () => {
  it('T-SESS-09: a logged-out visitor cannot join, and hears nothing', async () => {
    const anon = anonClient()
    const attempt = await tryJoin(anon, session.id)
    await broadcastSomething()
    await anon.removeChannel(attempt.channel)
    expect(attempt.status).toBe('CHANNEL_ERROR')
    expect(attempt.error).toMatch(/permissions to read/)
    expect(attempt.heard).toBe(false)
  }, 20_000)

  it('T-SESS-10: someone from another course cannot join, and hears nothing', async () => {
    const attempt = await tryJoin(outsider.client, session.id)
    await broadcastSomething()
    await outsider.client.removeChannel(attempt.channel)
    expect(attempt.status).toBe('CHANNEL_ERROR')
    expect(attempt.error).toMatch(/permissions to read/)
    expect(attempt.heard).toBe(false)
  }, 20_000)
})
