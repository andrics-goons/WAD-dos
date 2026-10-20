import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import JoinCodeInput from '@/components/ui/JoinCodeInput.vue'

let wrapper
afterEach(() => wrapper?.unmount())

// attached to the page so focus can move between boxes
function render(props = {}) {
  wrapper = mount(JoinCodeInput, { props, attachTo: document.body })
  return wrapper
}

const boxes = () => wrapper.findAll('input')
const shown = () =>
  boxes()
    .map((b) => b.element.value)
    .join('')
const lastEmitted = (event) => wrapper.emitted(event)?.at(-1)?.[0]

// what the browser does when you type one key into a box
async function type(i, key) {
  const box = boxes()[i]
  box.element.value = key
  await box.trigger('input')
}

describe('JoinCodeInput', () => {
  it('shows six boxes', () => {
    render()
    expect(boxes()).toHaveLength(6)
  })

  it('capitalises what you type and moves to the next box', async () => {
    render()
    await type(0, 'k')
    expect(boxes()[0].element.value).toBe('K')
    expect(lastEmitted('update:modelValue')).toBe('K')
    expect(document.activeElement).toBe(boxes()[1].element)
  })

  it('ignores keys that can never be in a code', async () => {
    render()
    for (const key of ['0', 'O', 'o', '1', 'I', 'l', '-', ' ']) await type(0, key)
    expect(boxes()[0].element.value).toBe('')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('says it is complete once all six are filled', async () => {
    render()
    for (const [i, key] of [...'k7qm2p'].entries()) await type(i, key)
    expect(shown()).toBe('K7QM2P')
    expect(lastEmitted('complete')).toBe('K7QM2P')
  })

  it('deleting the character in a box clears it', async () => {
    render()
    await type(0, 'A')
    await type(1, 'B')
    await type(1, '') // what the browser leaves after Backspace in a filled box
    expect(shown()).toBe('A')
    expect(lastEmitted('update:modelValue')).toBe('A')
  })

  it('backspace in an empty box clears the one before and goes back to it', async () => {
    render()
    await type(0, 'A')
    await type(1, 'B')
    await boxes()[2].trigger('keydown', { key: 'Backspace' })
    expect(shown()).toBe('A')
    expect(document.activeElement).toBe(boxes()[1].element)
  })

  it('pasting a whole code fills every box, capitalised', async () => {
    render()
    await boxes()[0].trigger('paste', { clipboardData: { getData: () => 'k7qm2p' } })
    expect(shown()).toBe('K7QM2P')
    expect(lastEmitted('complete')).toBe('K7QM2P')
  })

  it('fills in a code it is given, e.g. from a QR link', () => {
    render({ modelValue: 'ABC234' })
    expect(shown()).toBe('ABC234')
  })
})
