import { defineStore } from 'pinia'
import * as checkpointsApi from '@/api/checkpoints.api'

// the prof's side of a live class. the class itself (who's here, the latest checkpoint,
// saving and ending) is in the session store, this only lists the checkpoints saved so far
export const useTeachStore = defineStore('teach', () => {
  const checkpoints = (sessionId) => checkpointsApi.listCheckpoints(sessionId)

  return { checkpoints }
})
