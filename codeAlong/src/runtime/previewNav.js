import { onBeforeUnmount, ref } from 'vue'

// Back, Forward and Reload for a preview <iframe>, like a browser's (PreviewPanel, ReplayPreview).
// The preview is the student's app on WebContainer's own origin, so we can't reach into it. This
// script is put into every preview page (setPreviewScript in webcontainer.js) and talks by message:
// it tells us where it can go, and goes there when asked. The Navigation API only steps through
// the preview's own pages, so Back and Forward can never take you out of CodeAlong.
export const PREVIEW_NAV_SCRIPT = `
(() => {
  const nav = window.navigation
  if (!nav || window.parent === window) return
  const tell = () =>
    window.parent.postMessage(
      { codealongPreview: true, canGoBack: nav.canGoBack, canGoForward: nav.canGoForward },
      "*",
    )
  nav.addEventListener("currententrychange", tell)
  window.addEventListener("load", tell)
  tell()
  window.addEventListener("message", (event) => {
    if (event.source !== window.parent) return
    if (event.data === "codealong:back" && nav.canGoBack) nav.back()
    if (event.data === "codealong:forward" && nav.canGoForward) nav.forward()
    if (event.data === "codealong:reload") location.reload()
  })
})()
`

// In a component: <iframe ref="frame" :key="frameKey" …> and three buttons: back, forward, reload
export function usePreviewNav() {
  const frame = ref(null)
  const frameKey = ref(0) // bumped to load the preview again from its start page
  const canGoBack = ref(false)
  const canGoForward = ref(false)
  const connected = ref(false) // the preview's script has spoken, so it can reload the page it's on

  function onMessage(event) {
    if (event.source === frame.value?.contentWindow && event.data?.codealongPreview) {
      connected.value = true
      canGoBack.value = event.data.canGoBack
      canGoForward.value = event.data.canGoForward
    }
  }
  window.addEventListener('message', onMessage)
  onBeforeUnmount(() => window.removeEventListener('message', onMessage))

  const tell = (what) => frame.value?.contentWindow?.postMessage(`codealong:${what}`, '*')
  const back = () => tell('back')
  const forward = () => tell('forward')
  // the page it's on, like a browser; without the script, the app again from its start page
  function reload() {
    if (connected.value) return tell('reload')
    canGoBack.value = false
    canGoForward.value = false
    frameKey.value++
  }

  return { frame, frameKey, canGoBack, canGoForward, back, forward, reload }
}
