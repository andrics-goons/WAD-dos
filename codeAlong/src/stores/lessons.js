import { defineStore } from 'pinia'
import * as lessonsApi from '@/api/lessons.api'

// lesson calls for the new lesson page and the lesson editor
// nothing is shared between pages yet, so each page keeps its own copy of the lesson
export const useLessonsStore = defineStore('lessons', () => {
  const list = (courseId, options) => lessonsApi.listLessons(courseId, options)
  const get = (id) => lessonsApi.getLesson(id)
  const create = (courseId, form, steps) => lessonsApi.createLesson(courseId, form, steps)
  const update = (id, changes) => lessonsApi.updateLesson(id, changes)
  const saveSteps = (id, steps) => lessonsApi.replaceSteps(id, steps)
  const remove = (id) => lessonsApi.deleteLesson(id)

  return { list, get, create, update, saveSteps, remove }
})
