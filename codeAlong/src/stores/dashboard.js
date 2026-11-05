import { ref } from 'vue'
import { defineStore } from 'pinia'
import { Limits, LimitCode } from '@shared/constants.js'
import * as dashboardApi from '@/api/dashboard.api'
import { useLimitStore } from '@/stores/limits'

// the prof dashboard's data: the class summary card and the help summary.
export const useDashboardStore = defineStore('dashboard', () => {
  const helpSummary = ref(null)
  const loadingHelpSummary = ref(false)
  const helpSummaryError = ref(null)

  // runs the summary pipeline: when the dashboard loads and when the prof presses Refresh
  async function loadHelpSummary(sessionId) {
    loadingHelpSummary.value = true
    helpSummaryError.value = null
    try {
      helpSummary.value = await dashboardApi.getHelpSummary(sessionId)
      if (helpSummary.value.llmLimitReached) {
        useLimitStore().show(
          LimitCode.LLM,
          `The site's limit of ${Limits.LLM_CALLS_PER_MINUTE} AI calls a minute has been reached, so this summary was written without AI. Press Refresh in a minute to try again.`,
        )
      }
    } catch (err) {
      helpSummaryError.value = err
    } finally {
      loadingHelpSummary.value = false
    }
  }

  // what students clicked (Done, Slow down, help, check) and their errors, as numbers
  const classSummary = ref(null)
  const classSummaryError = ref(null)

  async function loadClassSummary(sessionId) {
    classSummaryError.value = null
    try {
      classSummary.value = await dashboardApi.getClassSummary(sessionId)
    } catch (err) {
      classSummaryError.value = err
    }
  }

  return {
    helpSummary,
    loadingHelpSummary,
    helpSummaryError,
    loadHelpSummary,
    classSummary,
    classSummaryError,
    loadClassSummary,
  }
})
