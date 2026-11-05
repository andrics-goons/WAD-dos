import { onBeforeUnmount, ref } from 'vue'
import { UNSUPPORTED_BROWSER } from './unsupportedBrowser'
import { startWorkspace } from './workspace'

// what every page that runs code in the WebContainer needs (the student workspace, the teach view,
// a TA's view of a student's code): whether this browser can run it, the preview URL once the dev
// server is up, and the error to show when it can't start. stops the preview on leaving the page.
//
//   const runtime = useRuntime("The editor couldn't start")
//   const booting = runtime.isolated ? getWebContainer() : null   // start booting early
//   …load the code…
//   await runtime.start(booting, files)
export function useRuntime(failMessage) {
  // WebContainer needs SharedArrayBuffer, which only exists on a cross-origin isolated page
  const isolated = window.crossOriginIsolated === true
  const bootError = ref(isolated ? '' : UNSUPPORTED_BROWSER)
  const previewUrl = ref('')
  let stop
  // set on leaving, so a boot that finishes afterwards doesn't leave a listener behind
  let unmounted = false

  onBeforeUnmount(() => {
    unmounted = true
    stop?.()
  })

  // waits for the boot, then mounts the files and starts the preview. A boot failure is shown here
  async function start(booting, files) {
    try {
      const webcontainer = await booting
      if (unmounted) return
      const started = await startWorkspace(webcontainer, files, (url) => (previewUrl.value = url))
      if (unmounted) started()
      else stop = started
    } catch (e) {
      if (!unmounted) bootError.value = `${failMessage}: ${e.message}`
    }
  }

  return { isolated, bootError, previewUrl, start, unmounted: () => unmounted }
}
