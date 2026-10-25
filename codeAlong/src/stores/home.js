import { defineStore } from 'pinia'
import * as sessionsApi from '@/api/sessions.api'

// The calls the home page (/home) makes on top of the courses store: classes that are live now.
export const useHomeStore = defineStore('home', () => {
  const liveClasses = () => sessionsApi.listLiveSessions()

  return { liveClasses }
})
