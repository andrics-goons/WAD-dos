import { ref } from 'vue'
import { defineStore } from 'pinia'
import * as coursesApi from '@/api/courses.api'

// My courses, for the courses page and the navbar. One course's details (people, lessons,
// sessions) are loaded by its page; this store only keeps the list.
export const useCoursesStore = defineStore('courses', () => {
  const courses = ref([])
  const loaded = ref(false)

  async function load({ force = false } = {}) {
    if (loaded.value && !force) return courses.value
    courses.value = await coursesApi.listCourses()
    loaded.value = true
    return courses.value
  }

  // one course for its page, with myRole / isOwner (not cached: the page always wants fresh data)
  const get = (id) => coursesApi.getCourse(id)

  // the People tab (names only); students see just themselves in listStudents
  const listStaff = (courseId) => coursesApi.listStaff(courseId)
  const listStudents = (courseId) => coursesApi.listStudents(courseId)
  const addStaff = (courseId, email) => coursesApi.addStaff(courseId, email)
  const removeStudent = (courseId, userId) => coursesApi.removeStudent(courseId, userId)

  async function create(form) {
    const course = await coursesApi.createCourse(form)
    courses.value = [course, ...courses.value]
    return course
  }

  async function enrol(code) {
    const course = await coursesApi.enrolWithCode(code)
    // enrolling twice is allowed, so don't list the course twice
    if (!courses.value.some((c) => c.id === course.id)) courses.value = [course, ...courses.value]
    return course
  }

  // after logout, so the next user doesn't see the last user's courses
  function reset() {
    courses.value = []
    loaded.value = false
  }

  return {
    courses,
    loaded,
    load,
    get,
    listStaff,
    listStudents,
    addStaff,
    removeStudent,
    create,
    enrol,
    reset,
  }
})
