import { defineStore } from 'pinia'
import * as coursesApi from '@/api/courses.api'
import * as lessonsApi from '@/api/lessons.api'
import * as sessionsApi from '@/api/sessions.api'

// The calls the course page (/courses/:id) makes: the course, its lessons, classes and people.
// Nothing here is shared with other pages, so the page keeps its own copy of what it loads.
export const useCourseStore = defineStore('course', () => {
  const get = (id) => coursesApi.getCourse(id)
  const lessons = (id, search) => lessonsApi.listLessons(id, { search })
  const sessions = (id) => sessionsApi.listSessions(id)
  const staff = (id) => coursesApi.listStaff(id)
  const students = (id) => coursesApi.listStudents(id)
  const addTa = (id, email) => coursesApi.addStaff(id, email)
  const removeStudent = (id, userId) => coursesApi.removeStudent(id, userId)
  const shareLink = (enrolCode) => coursesApi.enrolUrl(enrolCode)

  return { get, lessons, sessions, staff, students, addTa, removeStudent, shareLink }
})
