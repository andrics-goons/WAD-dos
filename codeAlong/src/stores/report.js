import { defineStore } from 'pinia'
import * as reportsApi from '@/api/reports.api'

// The calls the report page (/sessions/:id/report) makes. Nothing is shared with other pages,
// so the page keeps its own copy of what it loads.
export const useReportStore = defineStore('report', () => {
  const get = (sessionId) => reportsApi.getReport(sessionId)
  const trends = (lessonId) => reportsApi.lessonTrends(lessonId)
  const sendDigest = (sessionId) => reportsApi.sendDigest(sessionId)

  return { get, trends, sendDigest }
})
