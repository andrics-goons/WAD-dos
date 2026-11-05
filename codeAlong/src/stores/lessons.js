import { defineStore } from 'pinia'
import * as lessonsApi from '@/api/lessons.api'
import { loadFiles } from '@/cache/files'

// lesson calls for the new lesson page and the lesson editor
// nothing is shared between pages yet, so each page keeps its own copy of the lesson
export const useLessonsStore = defineStore('lessons', () => {
  // the files come from this browser's cache when it already has this version of them
  async function get(id) {
    const lesson = await lessonsApi.getLesson(id)
    return { ...lesson, files: await loadFiles('lesson', id, lesson.filesHash) }
  }
  const create = (courseId, form) => lessonsApi.createLesson(courseId, form)
  const update = (id, changes) => lessonsApi.updateLesson(id, changes)
  const remove = (id) => lessonsApi.deleteLesson(id)

  return { get, create, update, remove }
})
