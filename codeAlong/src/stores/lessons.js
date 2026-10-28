import { defineStore } from 'pinia'
import * as lessonsApi from '@/api/lessons.api'

// lesson calls for the new lesson page and the lesson editor
// nothing is shared between pages yet, so each page keeps its own copy of the lesson
export const useLessonsStore = defineStore('lessons', () => {
  const get = (id) => lessonsApi.getLesson(id)
  const create = (courseId, form) => lessonsApi.createLesson(courseId, form)
  const update = (id, changes) => lessonsApi.updateLesson(id, changes)
  const remove = (id) => lessonsApi.deleteLesson(id)

  return { get, create, update, remove }
})
