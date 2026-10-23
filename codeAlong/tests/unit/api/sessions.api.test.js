// @vitest-environment node
// sessions.api / checkpoints.api / the session store, against the real local stack.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/lib/supabase', async () => {
  const { anonClient } = await import('../rls/_helpers.js')
  return { supabase: anonClient() }
})

import { supabase } from '@/lib/supabase'
import * as sessionsApi from '@/api/sessions.api'
import * as checkpointsApi from '@/api/checkpoints.api'
import { useSessionStore } from '@/stores/session'
import { userClient, service, cleanup } from '../rls/_helpers.js'

const FILES = [{ path: 'index.html', language: 'html', content: '<div id="app"></div>' }]

let prof, stu, course, lesson, steps

// the app's single supabase client, signed in as someone
async function as(user) {
  await supabase.auth.signOut()
  const { error } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: 'pass1234',
  })
  if (error) throw error
}

const codeOf = async (promise) => {
  try {
    await promise
    return 'OK'
  } catch (error) {
    return error.code
  }
}

beforeAll(async () => {
  ;[prof, stu] = await Promise.all([
    userClient({ name: 'Prof Lee', role: 'prof' }),
    userClient({ name: 'Stu Dent' }),
  ])
  course = (
    await prof.client.rpc('create_course', {
      p_code: 'IS216',
      p_title: 'WAD II',
      p_term: 'AY2026/27 T1',
      p_section: 'G7',
    })
  ).data
  await stu.client.rpc('enrol_with_code', { p_code: course.enrol_code })
  lesson = (
    await prof.client
      .from('lessons')
      .insert({
        course_id: course.id,
        title: 'Mini Cart',
        files: FILES,
        entry_file: 'index.html',
        status: 'ready',
      })
      .select()
      .single()
  ).data
  steps = (
    await prof.client.rpc('replace_steps', {
      p_lesson_id: lesson.id,
      p_steps: [{ title: 'Create the app' }, { title: 'Add the cart' }],
    })
  ).data
})

afterAll(async () => {
  await supabase.auth.signOut()
  await service.from('sessions').delete().eq('course_id', course.id)
  await service.from('courses').delete().eq('id', course.id)
  await cleanup()
})

describe('sessions.api + checkpoints.api', () => {
  let session

  it('the prof starts a class and gets its join code', async () => {
    await as(prof)
    session = await sessionsApi.startSession(lesson.id)
    expect(session.status).toBe('live')
    expect(session.join_code).toMatch(/^[A-Z0-9]{6}$/)
  })

  it('getSession says you are staff, lists the steps in order, and has no checkpoint yet', async () => {
    const s = await sessionsApi.getSession(session.id)
    expect(s.role).toBe('staff')
    expect(s.steps.map((st) => st.title)).toEqual(['Create the app', 'Add the cart'])
    expect(s.latest_checkpoint).toBeNull()
  })

  it('getSession gives the workspace the starter project to load (hash, not files)', async () => {
    const s = await sessionsApi.getSession(session.id)
    expect(s.lesson).toEqual({
      title: 'Mini Cart',
      files_hash: lesson.files_hash,
      entry_file: 'index.html',
      dev_command: 'pnpm dev',
    })
  })

  it('saveCheckpoint numbers it, and lists leave the files out', async () => {
    const cp = await checkpointsApi.saveCheckpoint(session.id, steps[0].id, FILES, 'step 1')
    expect(cp.seq).toBe(1)
    const list = await checkpointsApi.listCheckpoints(session.id)
    expect(list).toHaveLength(1)
    expect(list[0]).not.toHaveProperty('files')
    expect((await sessionsApi.getSession(session.id)).latest_checkpoint.seq).toBe(1)
  })

  it('a student joins with the code, then can download the checkpoint files', async () => {
    await as(stu)
    expect(await sessionsApi.joinSession(session.join_code)).toEqual({
      session_id: session.id,
      role: 'student',
    })
    expect((await sessionsApi.getSession(session.id)).role).toBe('student')
    const [cp] = await checkpointsApi.listCheckpoints(session.id)
    expect((await checkpointsApi.getCheckpointFiles(cp.id)).files).toEqual(FILES)
  })

  it('errors come back as friendly codes', async () => {
    expect(await codeOf(sessionsApi.joinSession('ZZZZZZ'))).toBe('NOT_FOUND')
    expect(await codeOf(checkpointsApi.saveCheckpoint(session.id, steps[0].id, FILES))).toBe(
      'FORBIDDEN',
    )
    expect(await codeOf(sessionsApi.endSession(session.id))).toBe('FORBIDDEN')
  })

  it('the course page lists the class', async () => {
    const list = await sessionsApi.listSessions(course.id)
    expect(list.map((s) => s.id)).toContain(session.id)
    expect(list[0].lessons.title).toBe('Mini Cart')
  })

  it('the prof changes settings and ends the class', async () => {
    await as(prof)
    const updated = await sessionsApi.updateSettings(session.id, {
      ...session.settings,
      allowCatchUp: false,
    })
    expect(updated.settings.allowCatchUp).toBe(false)
    expect((await sessionsApi.endSession(session.id)).status).toBe('ended')
  })
})

describe('session store (a student following a live class)', () => {
  let session, store

  beforeAll(async () => {
    session = (await prof.client.rpc('start_session', { p_lesson_id: lesson.id })).data
    await as(stu)
    setActivePinia(createPinia())
    store = useSessionStore()
  })

  afterAll(() => store.close())

  it('open() loads the class and connects to its live channel', async () => {
    await store.open(session.id)
    expect(store.session.join_code).toBe(session.join_code)
    expect(store.steps).toHaveLength(2)
    expect(store.isStaff).toBe(false)
    await vi.waitFor(() => expect(store.connection).toBe('live'), { timeout: 10_000 })
  }, 15_000)

  it('T-SESS-03: before the first checkpoint, the student is on Step 1', () => {
    expect(store.currentStep.title).toBe('Create the app')
  })

  it('the prof sees the student as present (attendance)', async () => {
    const channel = prof.client.channel(`session:${session.id}`, { config: { private: true } })
    const here = () => Object.keys(channel.presenceState())
    channel.on('presence', { event: 'sync' }, () => {}).subscribe() // presence only arrives if you listen for it
    await vi.waitFor(() => expect(here()).toContain(stu.id), { timeout: 10_000 })
    await prof.client.removeChannel(channel)
  }, 15_000)

  it("T-SESS-06: the prof's checkpoint moves the student to that step straight away", async () => {
    await prof.client.rpc('save_checkpoint', {
      p_session_id: session.id,
      p_step_id: steps[1].id,
      p_files: FILES,
    })
    await vi.waitFor(() => expect(store.currentStep?.title).toBe('Add the cart'), {
      timeout: 10_000,
    })
    expect(store.latestCheckpoint.seq).toBe(1)
  }, 15_000)

  it('the new checkpoint can be downloaded, and its hash matches (for the file cache)', async () => {
    const { files, files_hash } = await checkpointsApi.getCheckpointFiles(store.latestCheckpoint.id)
    expect(files).toEqual(FILES)
    expect(files_hash).toBe(store.latestCheckpoint.files_hash)
  })

  it('T-SESS-12: a settings change reaches the student', async () => {
    await prof.client
      .from('sessions')
      .update({ settings: { ...session.settings, allowCatchUp: false } })
      .eq('id', session.id)
    await vi.waitFor(() => expect(store.session.settings.allowCatchUp).toBe(false), {
      timeout: 10_000,
    })
  }, 15_000)

  it('T-SESS-11: when the prof ends the class, the student sees it ended', async () => {
    await prof.client.rpc('end_session', { p_session_id: session.id })
    await vi.waitFor(() => expect(store.isLive).toBe(false), { timeout: 10_000 })
  }, 15_000)

  it('close() disconnects and clears the class', () => {
    store.close()
    expect(store.session).toBeNull()
    expect(store.connection).toBe('offline')
  })
})

describe('session store + channel for staff (the dashboard)', () => {
  let session, store, studentChannel

  beforeAll(async () => {
    session = (await prof.client.rpc('start_session', { p_lesson_id: lesson.id })).data
    await as(prof)
    setActivePinia(createPinia())
    store = useSessionStore()
  })

  afterAll(async () => {
    store.close()
    if (studentChannel) await stu.client.removeChannel(studentChannel)
  })

  it('the prof opens the class as staff', async () => {
    await store.open(session.id)
    expect(store.isStaff).toBe(true)
    await vi.waitFor(() => expect(store.connection).toBe('live'), { timeout: 10_000 })
  }, 15_000)

  it('a student arriving shows up in the attendance list', async () => {
    studentChannel = stu.client.channel(`session:${session.id}`, {
      config: { private: true, presence: { key: stu.id } },
    })
    studentChannel.subscribe(
      (status) =>
        status === 'SUBSCRIBED' && studentChannel.track({ userId: stu.id, name: 'Stu Dent' }),
    )
    await vi.waitFor(() => expect(store.present).toEqual([{ userId: stu.id, name: 'Stu Dent' }]), {
      timeout: 10_000,
    })
  }, 15_000)

  it('T-SESS-07: after the connection drops, it catches up on a checkpoint it missed', async () => {
    supabase.realtime.disconnect() // the wifi drops
    await vi.waitFor(() => expect(store.connection).not.toBe('live'), { timeout: 10_000 })
    await prof.client.rpc('save_checkpoint', {
      p_session_id: session.id,
      p_step_id: steps[1].id,
      p_files: FILES,
    })
    supabase.realtime.connect() // and comes back
    await vi.waitFor(() => expect(store.currentStep?.title).toBe('Add the cart'), {
      timeout: 10_000,
    })
  }, 20_000)

  it("the dashboard hears a student's status change live (onChange)", async () => {
    const rows = []
    const stop = store.onChange('student_status', (row) => rows.push(row))
    await stu.client
      .from('student_status')
      .upsert({ session_id: session.id, student_id: stu.id, done_step_order: 1 })
    await vi.waitFor(
      () => expect(rows.at(-1)).toMatchObject({ student_id: stu.id, done_step_order: 1 }),
      { timeout: 10_000 },
    )
    stop()
  }, 15_000)
})
