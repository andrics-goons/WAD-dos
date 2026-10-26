import { ref } from 'vue'
import { defineStore } from 'pinia'
import * as helpApi from '@/api/help.api'
import { useSessionStore } from '@/stores/session'

// My help requests in the class I'm in. A student only ever gets their own (the table's rules
// decide), and the session channel pushes every change, so a TA's claim or reply shows up here
// without a refresh.
export const useHelpStore = defineStore('help', () => {
  const requests = ref([])
  let stopListening = null

  // a changed row replaces the one we have; a live row has no joined data, so keep what we hold
  function merge(row) {
    const i = requests.value.findIndex((r) => r.id === row.id)
    if (i === -1) requests.value.push(row)
    else requests.value[i] = { ...requests.value[i], ...row }
  }

  async function load(sessionId) {
    stop()
    // listen first, so nothing that changes while we load is missed
    stopListening = useSessionStore().onChange('help_requests', merge)
    requests.value = await helpApi.listHelpRequests(sessionId)
  }

  // when leaving the page
  function stop() {
    stopListening?.()
    stopListening = null
    requests.value = []
  }

  async function send(request) {
    merge(await helpApi.createHelpRequest(request))
  }

  async function cancel(requestId) {
    merge(await helpApi.transitionHelpRequest(requestId, 'cancelled'))
  }

  return { requests, load, stop, send, cancel }
})
