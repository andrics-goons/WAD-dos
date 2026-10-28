import { ref } from 'vue'
import { defineStore } from 'pinia'
import * as dashboardApi from '@/api/dashboard.api'

// The prof dashboard's data. So far: the help summary (design-docs/05 §8a, part 2).
export const useDashboardStore = defineStore('dashboard', () => {
  const helpSummary = ref(null)
  const loadingHelpSummary = ref(false)
  const helpSummaryError = ref(null)

  // Runs the summary pipeline: when the dashboard loads and when the prof presses Refresh
  async function loadHelpSummary(sessionId) {
    loadingHelpSummary.value = true
    helpSummaryError.value = null
    try {
      helpSummary.value = await dashboardApi.getHelpSummary(sessionId)
    } catch (err) {
      helpSummaryError.value = err
    } finally {
      loadingHelpSummary.value = false
    }
  }

  return { helpSummary, loadingHelpSummary, helpSummaryError, loadHelpSummary }
})
