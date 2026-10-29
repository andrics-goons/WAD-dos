// @vitest-environment node
// replays.api.js, notes.api.js and the search() RPC against the real local stack, signed in as
// different users in turn (design-docs/04 "Replay, notes, search", 06 REPLAY).
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'

// The app's client reads VITE_ env vars; point it at the running local stack instead.
vi.mock('@/lib/supabase', async () => {
  const { anonClient } = await import('../rls/_helpers.js')
  return { supabase: anonClient() }
})

import { supabase } from '@/lib/supabase'
import * as replaysApi from '@/api/replays.api'
import * as notesApi from '@/api/notes.api'
import { NoteKind } from '@shared/constants.js'
import { createUser, signInAs, service, cleanup } from '../rls/_helpers.js'

const file = (content) => [{ path: 'index.js', language: 'js', content }]

let prof, stu, classmate, outsider, course, ended, live
const checkpoints = {} // seq -> row of the ended class

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
  ;[prof, stu, classmate, outsider] = await Promise.all([
    createUser({ name: 'Prof Replay', role: 'prof' }),
    createUser({ name: 'Stu Replay' }),
    createUser({ name: 'Cla Ssmate' }),
    createUser({ name: 'Out Sider' }),
  ])
  const profClient = await signInAs(prof)
  course = (
    await profClient.rpc('create_course', {
      p_code: 'IS216',
      p_title: 'WAD II',
      p_term: 'AY2026/27 T1',
      p_section: 'G7',
    })
  ).data
  for (const s of [stu, classmate]) {
    await (await signInAs(s)).rpc('enrol_with_code', { p_code: course.enrol_code })
  }
  const lesson = (
    await profClient
      .from('lessons')
      .insert({
        course_id: course.id,
        title: 'Week 6 · Mini Cart',
        files: file('start'),
        entry_file: 'index.js',
        status: 'ready',
      })
      .select()
      .single()
  ).data

  // One ended class with two checkpoints, one still live with a checkpoint of its own
  const save = (sid, content, title) =>
    profClient.rpc('save_checkpoint', { p_session_id: sid, p_files: file(content), p_title: title })
  ended = (await profClient.rpc('start_session', { p_lesson_id: lesson.id })).data
  await save(ended.id, 'one', 'Render the product list')
  await save(ended.id, 'two', 'Add to cart, or bump the quantity')
  await profClient.rpc('end_session', { p_session_id: ended.id })
  live = (await profClient.rpc('start_session', { p_lesson_id: lesson.id })).data
  await save(live.id, 'live', 'Cart in progress')

  const { data } = await service.from('checkpoints').select().eq('session_id', ended.id)
  for (const c of data) checkpoints[c.seq] = c
})

afterAll(async () => {
  await supabase.auth.signOut()
  // sessions first: they stop courses being deleted
  await service.from('sessions').delete().eq('course_id', course.id)
  await service.from('courses').delete().eq('id', course.id)
  await cleanup()
})

describe('listReplays', () => {
  it('lists only ended classes in my courses, with the lesson and course', async () => {
    await as(stu)
    const mine = (await replaysApi.listReplays()).filter((r) => r.courseId === course.id)
    expect(mine).toHaveLength(1)
    expect(mine[0]).toMatchObject({
      id: ended.id,
      lessonTitle: 'Week 6 · Mini Cart',
      checkpointCount: 2,
      course: { code: 'IS216', section: 'G7' },
    })
  })

  it('T-REP-07: a non-member sees no replay and reads zero checkpoints', async () => {
    await as(outsider)
    const theirs = await replaysApi.listReplays()
    expect(theirs.some((r) => r.courseId === course.id)).toBe(false)
    const { data } = await supabase.from('checkpoints').select('id').eq('session_id', ended.id)
    expect(data).toEqual([])
  })
})

describe('notes', () => {
  let note

  it('T-REP-04: add, edit and delete a note and a bookmark', async () => {
    await as(stu)
    note = await notesApi.createNote({
      sessionId: ended.id,
      checkpointId: checkpoints[2].id,
      kind: NoteKind.NOTE,
      body: 'Bump the quantity instead of pushing a second row',
    })
    const bookmark = await notesApi.createNote({
      sessionId: ended.id,
      checkpointId: checkpoints[1].id,
      kind: NoteKind.BOOKMARK,
    })
    expect(note).toMatchObject({ kind: 'note', checkpointId: checkpoints[2].id })
    expect(bookmark.body).toBeNull()

    const edited = await notesApi.updateNote(note.id, 'Bump qty, never push a duplicate row')
    expect(edited.body).toBe('Bump qty, never push a duplicate row')

    await notesApi.deleteNote(bookmark.id)
    const left = await notesApi.listNotes(ended.id)
    expect(left.map((n) => n.id)).toEqual([note.id])
  })

  it('a note needs text', async () => {
    await as(stu)
    const blank = notesApi.createNote({
      sessionId: ended.id,
      checkpointId: checkpoints[1].id,
      kind: NoteKind.NOTE,
      body: '   ',
    })
    expect(await codeOf(blank)).toBe('VALIDATION_FAILED')
  })

  it('notes are private to their author, even from staff', async () => {
    for (const other of [classmate, prof]) {
      await as(other)
      expect(await notesApi.listNotes(ended.id)).toEqual([])
    }
  })
})

describe('search', () => {
  it('T-REP-05: finds a checkpoint title and my own note, with what a link needs', async () => {
    await as(stu)
    // "bump" is in checkpoint 2's title and in my (edited) note on it
    const hits = await replaysApi.search('bump', course.id)
    const kinds = hits.map((h) => h.kind).sort()
    expect(kinds).toEqual(['checkpoint', 'note'])
    for (const h of hits) {
      expect(h).toMatchObject({ sessionId: ended.id, seq: 2, courseCode: 'IS216' })
    }
  })

  it("leaves out other people's notes and classes that haven't ended", async () => {
    await as(classmate)
    const hits = await replaysApi.search('quantity bump cart', course.id)
    expect(hits.every((h) => h.kind === 'checkpoint')).toBe(true)
    expect(hits.some((h) => h.sessionId === live.id)).toBe(false)
  })

  it('T-REP-06: regex and query-syntax characters are plain text, never an error', async () => {
    await as(stu)
    for (const q of ['.*[(\\', "a & | ! :* <-> '", 'cart)', '   ']) {
      await expect(replaysApi.search(q, course.id)).resolves.toBeInstanceOf(Array)
    }
    expect((await replaysApi.search('cart)', course.id)).length).toBeGreaterThan(0)
  })

  it('a non-member finds nothing in the course', async () => {
    await as(outsider)
    expect(await replaysApi.search('quantity', course.id)).toEqual([])
  })

  it('needs a login', async () => {
    await supabase.auth.signOut()
    expect(await codeOf(replaysApi.search('cart'))).toBe('UNAUTHENTICATED')
  })
})
