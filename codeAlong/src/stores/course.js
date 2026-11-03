import { defineStore } from 'pinia'
import * as coursesApi from '@/api/courses.api'
import * as lessonsApi from '@/api/lessons.api'
import * as sessionsApi from '@/api/sessions.api'
import { openSessionChannel } from '@/api/sessionChannel.api'
import { useCoursesStore } from './courses'

// The calls the course page (/courses/:id) makes: the course, its lessons, classes and people.
// Nothing here is shared with other pages, so the page keeps its own copy of what it loads.
export const useCourseStore = defineStore('course', () => {
  const get = (id) => coursesApi.getCourse(id)
  const lessons = (id, search) => lessonsApi.listLessons(id, { search })
  const sessions = (id) => sessionsApi.listSessions(id)
  const staff = (id) => coursesApi.listStaff(id)
  const students = (id) => coursesApi.listStudents(id)
  const addTa = (id, email) => coursesApi.addStaff(id, email)
  const removeTa = (id, userId) => coursesApi.removeStaff(id, userId)
  const removeStudent = (id, userId) => coursesApi.removeStudent(id, userId)
  const shareLink = (enrolCode) => coursesApi.enrolUrl(enrolCode)

  // Edit or delete (owner), archive (anyone, for themselves). The courses page keeps a list, so refresh it after.
  const refreshList = () => useCoursesStore().load({ force: true })
  async function update(id, changes) {
    const course = await coursesApi.updateCourse(id, changes)
    await refreshList()
    return course
  }
  async function setArchived(id, archived) {
    await coursesApi.setArchived(id, archived)
    await refreshList()
  }
  async function remove(id) {
    await coursesApi.deleteCourse(id)
    await refreshList()
  }
  const archived = async () =>
    (await coursesApi.listCourses({ includeArchived: true })).filter((c) => c.archived)

  // Who's online in a live class. Only listens: looking at this doesn't put you on the list.
  const watchPresent = (sessionId, onPresence) => openSessionChannel(sessionId, { onPresence })

  return {
    get,
    lessons,
    sessions,
    staff,
    students,
    addTa,
    removeTa,
    removeStudent,
    shareLink,
    update,
    setArchived,
    remove,
    archived,
    watchPresent,
  }
})
