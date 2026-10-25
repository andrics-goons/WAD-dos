import { defineStore } from 'pinia'
import * as checkpointsApi from '@/api/checkpoints.api'
import * as lessonsApi from '@/api/lessons.api'

// the prof's side of a live class. the class itself (steps, checkpoints, who's here) is in
// the session store, this only loads the code the prof's editor starts from
export const useTeachStore = defineStore('teach', () => {
  // the latest checkpoint's code, or the lesson's starter files before the first one
  async function startingFiles(session) {
    if (session.latest_checkpoint) {
      const { files } = await checkpointsApi.getCheckpointFiles(session.latest_checkpoint.id)
      return files
    }
    const { files } = await lessonsApi.getLesson(session.lesson_id)
    return files
  }

  return { startingFiles }
})
