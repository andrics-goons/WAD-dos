// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { userClient, makeAdmin, service, cleanup } from './_helpers.js'

// the same column lists lessons.api.js selects, so these tests exercise its queries.
const LESSON_SUMMARY = 'id, course_id, title, week, description, status, updated_at'
const LESSON_DETAIL = `${LESSON_SUMMARY}, files, files_hash, entry_file, dev_command, source, created_by, created_at`

const file = (path, language = 'js', content = '') => ({ path, language, content })
const STARTER = [
  file('index.html', 'html', '<div id="app"></div>'),
  file('src/main.js', 'js', '// TODO 1: create the app'),
  file('package.json', 'json', '{}'),
]

const createdCourses = []
let profA, ta, stu, outsider, admin
let course

// same shape as createLesson() in lessons.api.js. no week by default.
function insertLesson(client, fields = {}) {
  return client
    .from('lessons')
    .insert({
      course_id: course.id,
      title: 'Week 6 · Mini Cart',
      week: null,
      files: STARTER,
      entry_file: 'index.html',
      source: { type: 'upload' },
      status: 'draft',
      ...fields,
    })
    .select(LESSON_DETAIL)
    .single()
}

beforeAll(async () => {
  ;[profA, ta, stu, outsider, admin] = await Promise.all([
    userClient({ name: 'Prof A', role: 'prof' }),
    userClient({ name: 'Tia Ta' }),
    userClient({ name: 'Stu Dent' }),
    userClient({ name: 'Out Sider' }),
    userClient({ name: 'Ada Admin' }),
  ])
  await makeAdmin(admin.id)

  const { data } = await profA.client.rpc('create_course', {
    p_code: 'IS216',
    p_title: 'WAD II',
    p_term: 'AY2026/27 T1',
    p_section: 'G2',
  })
  course = data
  createdCourses.push(course.id)
  await profA.client.rpc('add_course_staff', { p_course_id: course.id, p_email: ta.email })
  await stu.client.rpc('enrol_with_code', { p_code: course.enrol_code })
})

afterAll(async () => {
  // deleting the course cascades to its lessons
  await service.from('courses').delete().in('id', createdCourses)
  await cleanup()
})

describe('who can read lessons', () => {
  let draft, ready

  beforeAll(async () => {
    ;({ data: draft } = await insertLesson(profA.client, { title: 'Still a draft' }))
    ;({ data: ready } = await insertLesson(profA.client, {
      title: 'Ready to teach',
      status: 'ready',
    }))
  })

  it('an enrolled student sees ready lessons but not drafts', async () => {
    const { data } = await stu.client.from('lessons').select('id').in('id', [draft.id, ready.id])
    expect(data.map((l) => l.id)).toEqual([ready.id])
  })

  it('someone outside the course sees nothing', async () => {
    const { data } = await outsider.client.from('lessons').select('id').eq('course_id', course.id)
    expect(data).toEqual([])
  })
})
