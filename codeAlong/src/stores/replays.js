import { defineStore } from 'pinia'
import * as replaysApi from '@/api/replays.api'
import * as notesApi from '@/api/notes.api'
import * as checkpointsApi from '@/api/checkpoints.api'
import * as filesApi from '@/api/files.api'
import { loadFiles } from '@/cache/files.js'

// the calls the replay pages (/replays, /replays/:sessionId) make.
// nothing is shared between pages, so each page keeps its own copy of what it loads.
export const useReplaysStore = defineStore('replays', () => {
  const list = () => replaysApi.listReplays()
  const search = (q, courseId) => replaysApi.search(q, courseId)

  // the class (null if I can't see it), its lesson (for the starter code) and its checkpoints,
  // without files
  const session = (id) => replaysApi.getReplay(id)
  const checkpoints = (id) => checkpointsApi.listCheckpoints(id)

  // files through the IndexedDB cache, so stepping back and forth doesn't download again
  const starterFiles = (session) =>
    loadFiles('lesson', session.lesson_id, session.lesson.files_hash)
  const checkpointFiles = (checkpoint) =>
    loadFiles('checkpoint', checkpoint.id, checkpoint.files_hash)

  // my own code when the class ended (my last autosave), or null if I never joined
  const myCode = async (sessionId) => {
    const autosave = await filesApi.findMyAutosave(sessionId)
    return autosave ? loadFiles('snapshot', autosave.id) : null
  }

  const notes = (sessionId) => notesApi.listNotes(sessionId)
  const addNote = (note) => notesApi.createNote(note)
  const editNote = (id, body) => notesApi.updateNote(id, body)
  const removeNote = (id) => notesApi.deleteNote(id)

  return {
    list,
    search,
    session,
    checkpoints,
    starterFiles,
    checkpointFiles,
    myCode,
    notes,
    addNote,
    editNote,
    removeNote,
  }
})
