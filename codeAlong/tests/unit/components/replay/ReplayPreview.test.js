// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ReplayPreview from '@/components/replay/ReplayPreview.vue'
import { getWebContainer } from '@/runtime/webcontainer'

vi.mock('@/runtime/webcontainer', async (importOriginal) => ({
  ...(await importOriginal()),
  getWebContainer: vi.fn(),
}))

// A fake WebContainer: records what's spawned, finishes `pnpm install` with `installExit`,
// and leaves the dev server running until it's killed
function fakeContainer({ installExit = 0 } = {}) {
  const listeners = new Set()
  const spawned = []
  return {
    spawned,
    fs: { rm: vi.fn(async () => {}), mkdir: vi.fn(async () => {}) },
    mount: vi.fn(async () => {}),
    on: vi.fn((event, fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    }),
    spawn: vi.fn(async (command, args, options) => {
      let exit
      const proc = {
        command: [command, ...args].join(' '),
        options,
        exit: new Promise((resolve) => (exit = resolve)),
        kill: vi.fn(),
      }
      if (args[0] === 'install') exit(installExit)
      spawned.push(proc)
      return proc
    }),
    listeners,
    serverReady: (url) => listeners.forEach((fn) => fn(5173, url)),
  }
}

const pkg = (deps) => ({ path: 'package.json', content: JSON.stringify({ dependencies: deps }) })
const STEP_1 = [pkg({ vue: '3' }), { path: 'src/App.vue', content: '<p>1</p>' }]
const STEP_2 = [pkg({ vue: '3' }), { path: 'src/Cart.vue', content: '<p>2</p>' }]
const STEP_3 = [pkg({ vue: '3', axios: '1' }), { path: 'src/Cart.vue', content: '<p>3</p>' }]

let wc, wrapper
beforeEach(() => {
  wc = fakeContainer()
  getWebContainer.mockReset().mockResolvedValue(wc)
})
afterEach(() => wrapper?.unmount())

async function startWith(files) {
  wrapper = mount(ReplayPreview, { props: { files } })
  await wrapper.get('button').trigger('click')
  await flushPromises()
}
const commands = () => wc.spawned.map((p) => p.command)

describe('ReplayPreview', () => {
  it('waits to be asked, since the first install is slow', () => {
    wrapper = mount(ReplayPreview, { props: { files: STEP_1 } })
    expect(wrapper.text()).toContain('Run preview')
    expect(getWebContainer).not.toHaveBeenCalled()
  })

  it('T-REP-03: runs the checkpoint in its own folder and shows the app once it is up', async () => {
    await startWith(STEP_1)
    expect(wc.mount).toHaveBeenCalledWith(
      { 'package.json': expect.anything(), src: { directory: { 'App.vue': expect.anything() } } },
      { mountPoint: 'replay' },
    )
    expect(commands()).toEqual(['pnpm install --prefer-offline', 'pnpm run dev'])
    expect(wc.spawned.every((p) => p.options.cwd === 'replay')).toBe(true)
    expect(wrapper.text()).toContain('Starting the app')

    wc.serverReady('https://preview.test')
    await flushPromises()
    expect(wrapper.get('[data-testid="preview-frame"]').attributes('src')).toBe(
      'https://preview.test',
    )
  })

  it("ignores the lesson's backend announcing itself, and shows the app on Vite's port", async () => {
    await startWith(STEP_1)
    wc.listeners.forEach((fn) => fn(3001, 'https://api.test')) // Express: its page is "Cannot GET /"
    await flushPromises()
    expect(wrapper.find('[data-testid="preview-frame"]').exists()).toBe(false)
    wc.listeners.forEach((fn) => fn(5174, 'https://vite.test')) // Vite, when 5173 was taken
    await flushPromises()
    expect(wrapper.get('[data-testid="preview-frame"]').attributes('src')).toBe('https://vite.test')
  })

  it('runs an app in client/ next to server/ from its own folder', async () => {
    const files = [
      { path: 'client/package.json', content: '{}' },
      { path: 'client/index.html', content: '<div></div>' },
      { path: 'server/package.json', content: '{}' },
    ]
    await startWith(files)
    expect(wc.spawned.every((p) => p.options.cwd === 'replay/client')).toBe(true)
  })

  it('moves to another step by rewriting the files, without reinstalling', async () => {
    await startWith(STEP_1)
    await wrapper.setProps({ files: STEP_2 })
    await flushPromises()
    expect(wc.fs.rm).toHaveBeenCalledWith('replay/src/App.vue', { force: true })
    expect(wc.mount).toHaveBeenCalledTimes(2)
    expect(commands()).toEqual(['pnpm install --prefer-offline', 'pnpm run dev'])
  })

  it('reinstalls and restarts when the step changed package.json', async () => {
    await startWith(STEP_2)
    const firstServer = wc.spawned[1]
    await wrapper.setProps({ files: STEP_3 })
    await flushPromises()
    expect(firstServer.kill).toHaveBeenCalled()
    expect(commands()).toEqual([
      'pnpm install --prefer-offline',
      'pnpm run dev',
      'pnpm install --prefer-offline',
      'pnpm run dev',
    ])
    expect(wrapper.text()).not.toContain('stopped') // killing it ourselves isn't a failure
  })

  it('says so when the packages fail to install, and can try again', async () => {
    wc = fakeContainer({ installExit: 1 })
    getWebContainer.mockResolvedValue(wc)
    await startWith(STEP_1)
    expect(wrapper.get('.ca-field-error').text()).toBe(
      "This step didn't start: Couldn't install the packages",
    )
    expect(commands()).toEqual(['pnpm install --prefer-offline'])

    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(commands()).toEqual(['pnpm install --prefer-offline', 'pnpm install --prefer-offline'])
  })

  it('T-REP-09: with autostart it begins by itself once there is code, and says how far it is', async () => {
    wrapper = mount(ReplayPreview, { props: { files: [], autostart: true } })
    await flushPromises()
    expect(getWebContainer).not.toHaveBeenCalled() // nothing to run yet

    await wrapper.setProps({ files: STEP_1 })
    await flushPromises()
    expect(commands()).toEqual(['pnpm install --prefer-offline', 'pnpm run dev'])
    expect(wrapper.emitted('state').flat()).toEqual(['installing', 'starting'])
    wc.serverReady('https://preview.test')
    await flushPromises()
    expect(wrapper.emitted('state').flat().at(-1)).toBe('ready')
  })

  it('T-REP-09: a small screen waits for Run preview even with autostart', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    wrapper = mount(ReplayPreview, { props: { files: STEP_1, autostart: true } })
    await flushPromises()
    expect(getWebContainer).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('stops the app and stops listening when you leave the page', async () => {
    await startWith(STEP_1)
    const server = wc.spawned[1]
    wrapper.unmount()
    wrapper = null
    expect(server.kill).toHaveBeenCalled()
    expect(wc.listeners.size).toBe(0)
  })
})

describe('ReplayPreview progress', () => {
  it('T-REP-09: lists the steps, with the install counted from what pnpm reports', async () => {
    wc.spawn.mockImplementationOnce(async () => ({
      exit: new Promise(() => {}), // the install never finishes in this test
      kill: vi.fn(),
      output: new ReadableStream({
        start(controller) {
          controller.enqueue('Progress: resolved 50, reused 0, downloaded 10, added 25')
        },
      }),
    }))
    await startWith(STEP_1)
    await flushPromises()
    expect(wrapper.find('progress').exists()).toBe(true)
    expect(wrapper.text()).toContain('Installing packages')
    expect(wrapper.text()).toContain('25 of 50 packages')
  })
})
