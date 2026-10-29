import { defineStore } from 'pinia'
import * as replaysApi from '@/api/replays.api'
import * as notesApi from '@/api/notes.api'
import * as sessionsApi from '@/api/sessions.api'
import * as checkpointsApi from '@/api/checkpoints.api'
import { loadFiles } from '@/cache/files.js'

// The calls the replay pages (/replays, /replays/:sessionId) make. Owner: Ray Yien.
// Nothing is shared between pages, so each page keeps its own copy of what it loads.
export const useReplaysStore = defineStore('replays', () => {
  const list = () => replaysApi.listReplays()
  const search = (q, courseId) => replaysApi.search(q, courseId)

  // the class, its lesson (for the starter code) and its checkpoints, without files
  const session = (id) => sessionsApi.getSession(id)
  const checkpoints = (id) => checkpointsApi.listCheckpoints(id)

  // files through the IndexedDB cache, so stepping back and forth doesn't download again
  const starterFiles = (session) =>
    loadFiles('lesson', session.lesson_id, session.lesson.files_hash)
  const checkpointFiles = (checkpoint) =>
    loadFiles('checkpoint', checkpoint.id, checkpoint.files_hash)

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
    notes,
    addNote,
    editNote,
    removeNote,
  }
})
