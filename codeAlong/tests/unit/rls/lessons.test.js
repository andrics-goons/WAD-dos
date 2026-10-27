// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { anonClient, userClient, makeAdmin, service, cleanup } from './_helpers.js'


// The same column lists Evan's lessons.api.js selects, so these tests exercise his queries.
const LESSON_SUMMARY = 'id, course_id, title, week, description, status, updated_at'
const LESSON_DETAIL = `${LESSON_SUMMARY}, files, files_hash, entry_file, dev_command, source, created_by, created_at`

const file = (path, language = 'js', content = '') => ({ path, language, content })
const STARTER = [
  file('index.html', 'html', '<div id="app"></div>'),
  file('src/main.js', 'js', '// TODO 1: create the app'),
  file('package.json', 'json', '{}'),
]

const createdCourses = []
let profA, profB, ta, stu, outsider, admin
let course

// Same shape as createLesson() in lessons.api.js
function insertLesson(client, fields = {}) {
  return client
    .from('lessons')
    .insert({
      course_id: course.id,
      title: 'Week 6 · Mini Cart',
      week: 6,
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
  ;[profA, profB, ta, stu, outsider, admin] = await Promise.all([
    userClient({ name: 'Prof A', role: 'prof' }),
    userClient({ name: 'Prof B', role: 'prof' }),
    userClient({ name: 'Tia Ta' }),
    userClient({ name: 'Stu Dent' }),
    userClient({ name: 'Out Sider' }),
    userClient({ name: 'Ada Admin' }),
  ])
  await makeAdmin(admin.id)

  const { data } = await profA.client.rpc('create_course', {
    p_code: 'IS216', p_title: 'WAD II', p_term: 'AY2026/27 T1', p_section: 'G2',
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

describe('creating a lesson (the createLesson() path)', () => {
  let lesson

  it("the course's prof creates a draft lesson and gets it straight back", async () => {
    const { data, error } = await insertLesson(profA.client)
    expect(error).toBeNull()
    lesson = data
    expect(lesson.status).toBe('draft')
  })

  it('the database fills in created_by, dev_command and files_hash', () => {
    expect(lesson.created_by).toBe(profA.id)
    expect(lesson.dev_command).toBe('pnpm dev')
    expect(lesson.files_hash).toMatch(/^[0-9a-f]{32}$/)
  })

  it('a prof cannot create a lesson in someone else\'s name', async () => {
    const { error } = await insertLesson(profA.client, { created_by: profB.id })
    expect(error?.code).toBe('42501')
  })

  it("a prof cannot create a lesson in another prof's course", async () => {
    const { error } = await insertLesson(profB.client)
    expect(error?.code).toBe('42501')
  })

  it('a TA cannot create a lesson (prof only)', async () => {
    const { error } = await insertLesson(ta.client)
    expect(error?.code).toBe('42501')
  })

  it('a student cannot create a lesson', async () => {
    const { error } = await insertLesson(stu.client)
    expect(error?.code).toBe('42501')
  })
})

describe('T-LES-05: the files are validated by the database', () => {
  it.each([
    ['a path climbing out of the project', [file('../secret.js')], 'index.html'],
    ['an absolute path', [file('/etc/passwd.js')], '/etc/passwd.js'],
    ['an unsupported file type', [file('logo.png', 'png')], 'logo.png'],
    ['no files at all', [], 'index.html'],
    ['two files with the same path', [file('a.js'), file('a.js')], 'a.js'],
    ['an entry file that is not in the list', STARTER, 'missing.html'],
    ['more than 40 files', Array.from({ length: 41 }, (_, i) => file(`f${i}.js`)), 'f0.js'],
    ['more than 200 KB', [file('big.js', 'js', 'x'.repeat(200_001))], 'big.js'],
    ['files that are not a list', { path: 'a.js' }, 'a.js'],
  ])('rejects %s', async (_label, files, entryFile) => {
    const { error } = await insertLesson(profA.client, { files, entry_file: entryFile })
    expect(error?.code).toBe('23514') // check constraint → mapError: VALIDATION_FAILED
  })

  it('accepts .vue, .css and .md files in folders', async () => {
    const files = [...STARTER, file('src/App.vue', 'vue'), file('src/style.css', 'css'), file('README.md', 'md')]
    const { error } = await insertLesson(profA.client, { files, title: 'Vue lesson' })
    expect(error).toBeNull()
  })
})

describe('who can read lessons', () => {
  let draft, ready

  beforeAll(async () => {
    ;({ data: draft } = await insertLesson(profA.client, { title: 'Still a draft' }))
    ;({ data: ready } = await insertLesson(profA.client, { title: 'Ready to teach', status: 'ready' }))
  })

  it('the prof and the TA see drafts', async () => {
    for (const who of [profA, ta]) {
      const { data } = await who.client.from('lessons').select('id').in('id', [draft.id, ready.id])
      expect(data).toHaveLength(2)
    }
  })

  it('an enrolled student sees ready lessons but not drafts', async () => {
    const { data } = await stu.client.from('lessons').select('id').in('id', [draft.id, ready.id])
    expect(data.map((l) => l.id)).toEqual([ready.id])
  })

  it('someone outside the course sees nothing', async () => {
    const { data } = await outsider.client.from('lessons').select('id').eq('course_id', course.id)
    expect(data).toEqual([])
  })

  it('a logged-out visitor sees nothing', async () => {
    const { data } = await anonClient().from('lessons').select('id')
    expect(data).toEqual([])
  })

  it('an admin sees drafts too', async () => {
    const { data } = await admin.client.from('lessons').select('id').eq('id', draft.id)
    expect(data).toHaveLength(1)
  })

  it('the listLessons() query (summary columns, search, ordering) works', async () => {
    const { data, error } = await profA.client
      .from('lessons')
      .select(LESSON_SUMMARY)
      .eq('course_id', course.id)
      .order('week', { ascending: true, nullsFirst: false })
      .order('title')
      .ilike('title', '%ready%')
    expect(error).toBeNull()
    expect(data.map((l) => l.id)).toEqual([ready.id])
  })
})

describe('editing a lesson (the updateLesson() path)', () => {
  let lesson

  beforeAll(async () => {
    ;({ data: lesson } = await insertLesson(profA.client, { title: 'To edit' }))
  })

  it('the prof marks it ready; updated_at moves forward', async () => {
    const { data, error } = await profA.client
      .from('lessons')
      .update({ status: 'ready' })
      .eq('id', lesson.id)
      .select(LESSON_DETAIL)
      .single()
    expect(error).toBeNull()
    expect(data.status).toBe('ready')
    expect(new Date(data.updated_at) > new Date(lesson.updated_at)).toBe(true)
  })

  it('changing the files changes files_hash (so caches refetch)', async () => {
    const { data } = await profA.client
      .from('lessons')
      .update({ files: [...STARTER, file('src/extra.js')] })
      .eq('id', lesson.id)
      .select('files_hash')
      .single()
    expect(data.files_hash).not.toBe(lesson.files_hash)
  })

  it('a TA cannot edit the lesson; the update matches nothing', async () => {
    const { data } = await ta.client.from('lessons').update({ title: 'Hijacked' }).eq('id', lesson.id).select()
    expect(data).toEqual([])
  })

  it('a prof cannot move the lesson into a course they do not run', async () => {
    const { data: other } = await profB.client.rpc('create_course', {
      p_code: 'IS999', p_title: 'B', p_term: 'T', p_section: 'S',
    })
    createdCourses.push(other.id)
    const { error } = await profA.client.from('lessons').update({ course_id: other.id }).eq('id', lesson.id)
    expect(error?.code).toBe('42501')
  })
})

describe('deleting a lesson', () => {
  it('the prof deletes a lesson that was never taught', async () => {
    const { data: lesson } = await insertLesson(profA.client, { title: 'Throwaway' })

    const { error } = await profA.client.from('lessons').delete().eq('id', lesson.id)
    expect(error).toBeNull()
    const { data } = await service.from('lessons').select('id').eq('id', lesson.id)
    expect(data).toEqual([])
  })

  it('a TA cannot delete a lesson', async () => {
    const { data: lesson } = await insertLesson(profA.client, { title: 'Keep me' })
    await ta.client.from('lessons').delete().eq('id', lesson.id)
    const { data } = await service.from('lessons').select('id').eq('id', lesson.id)
    expect(data).toHaveLength(1)
  })
})

describe('updated_at now maintained on earlier tables too', () => {
  it('renaming yourself moves profiles.updated_at forward', async () => {
    const before = (await service.from('profiles').select('updated_at').eq('id', stu.id).single()).data
    await stu.client.from('profiles').update({ name: 'Stu D' }).eq('id', stu.id)
    const after = (await service.from('profiles').select('updated_at').eq('id', stu.id).single()).data
    expect(new Date(after.updated_at) > new Date(before.updated_at)).toBe(true)
  })
})
