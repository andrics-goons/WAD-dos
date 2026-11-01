// @vitest-environment node
// T-GH-06: an export never leaves the user's GitHub token in our database (design-docs/05 §11).
// Runs the real export handler against the local stack, reading the class as the prof like
// index.ts does, with the mock GitHub writing test_outbox as EXTERNAL_APIS=mock would. Then
// dumps every row of every public table and looks for the token.
import { execSync } from 'node:child_process'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { userClient, service, readOutbox, outboxMark, cleanup } from './_helpers.js'
import { handleExport } from '../../../supabase/functions/github-export/handler.ts'
import { mockGithub } from '../../../supabase/functions/_shared/github.ts'

const TOKEN = `gho_tgh06_${crypto.randomUUID()}`
const file = (path, content) => ({ path, language: 'html', content })

let prof, course, session, startMark

beforeAll(async () => {
  prof = await userClient({ name: 'Prof Lee', role: 'prof' })
  course = (
    await prof.client.rpc('create_course', {
      p_code: 'IS216',
      p_title: 'WAD II',
      p_term: 'AY2026/27 T1',
      p_section: 'G2',
    })
  ).data
  const lesson = (
    await prof.client
      .from('lessons')
      .insert({
        course_id: course.id,
        title: 'Week 6 · Mini Cart',
        files: [file('index.html', 'start')],
        entry_file: 'index.html',
        status: 'ready',
      })
      .select()
      .single()
  ).data
  session = (await prof.client.rpc('start_session', { p_lesson_id: lesson.id })).data
  for (const [content, title] of [
    ['<ul></ul>', 'List'],
    ['<ul><li></li></ul>', 'Items'],
  ]) {
    const { error } = await prof.client.rpc('save_checkpoint', {
      p_session_id: session.id,
      p_files: [file('index.html', content)],
      p_title: title,
    })
    if (error) throw error
  }
  startMark = await outboxMark()
})

afterAll(async () => {
  await service.from('test_outbox').delete().gt('id', startMark)
  // sessions first: they stop courses being deleted
  await service.from('sessions').delete().eq('course_id', course.id)
  await service.from('courses').delete().eq('id', course.id)
  await cleanup()
})

// The same reads as github-export/index.ts, as the prof
async function loadExport(req, sessionId) {
  const { data: s } = await prof.client
    .from('sessions')
    .select('lessons(title)')
    .eq('id', sessionId)
    .maybeSingle()
  if (!s) return null
  const { data: checkpoints, error } = await prof.client
    .from('checkpoints')
    .select('files, seq, title')
    .eq('session_id', sessionId)
    .order('seq')
  if (error) throw error
  return { lessonTitle: s.lessons.title, checkpoints }
}

describe('github-export', () => {
  it('T-GH-06: no GitHub token in any row of any public table after an export', async () => {
    const req = new Request('https://fn.test/github-export', {
      method: 'POST',
      body: JSON.stringify({ sessionId: session.id, repoName: 'mini-cart', providerToken: TOKEN }),
    })
    const res = await handleExport(req, {
      callerId: async () => prof.id,
      loadExport,
      makeGithub: () => mockGithub(service, () => undefined),
      wait: async () => {},
    })
    expect(res.status).toBe(200)
    // it really exported: repo, ref, 2 × (tree + commit), branch update
    expect(await readOutbox('github', { since: startMark })).toHaveLength(7)

    const dump = execSync(
      'docker exec supabase_db_codeAlong pg_dump -U postgres --data-only --schema=public',
      { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
    )
    expect(dump).toContain(session.id) // the dump does hold this class's rows
    expect(dump).not.toContain(TOKEN)
  })
})
