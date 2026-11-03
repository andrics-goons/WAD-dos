// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import NotesPanel from '@/components/replay/NotesPanel.vue'

const NOTES = [{ id: 'n1', body: 'props.items, not items', updatedAt: '2026-10-12T06:44:00Z' }]

const buttonWith = (wrapper, text) => wrapper.findAll('button').find((b) => b.text().includes(text))

describe('NotesPanel', () => {
  it('shows my notes, or says there are none', () => {
    expect(mount(NotesPanel).text()).toContain('No notes on this checkpoint yet')
    const wrapper = mount(NotesPanel, { props: { notes: NOTES } })
    expect(wrapper.findAll('[data-testid="note-item"]')).toHaveLength(1)
    expect(wrapper.text()).toContain('props.items, not items')
  })

  it('adds a note, trimmed, and clears the box once it has saved', async () => {
    const wrapper = mount(NotesPanel)
    await wrapper.get('#note-new').setValue('  watch needs deep: true  ')
    await wrapper.get('form').trigger('submit')
    const [[body, done]] = wrapper.emitted('add')
    expect(body).toBe('watch needs deep: true')
    // not saved yet (or the save failed): the text stays
    expect(wrapper.get('#note-new').element.value).toBe('  watch needs deep: true  ')
    done()
    await wrapper.vm.$nextTick()
    expect(wrapper.get('#note-new').element.value).toBe('')
  })

  it('says how long a note may be', async () => {
    const wrapper = mount(NotesPanel)
    await wrapper.get('#note-new').setValue('x'.repeat(2001))
    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('.ca-field-error').text()).toBe(
      'Notes can be up to 2000 characters. This one has 2001.',
    )
  })

  it("won't send a blank note", async () => {
    const wrapper = mount(NotesPanel)
    await wrapper.get('#note-new').setValue('   ')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('add')).toBeUndefined()
    expect(wrapper.get('.ca-field-error').text()).toBe('Write something first')
  })

  it('edits a note, closing the editor once it has saved', async () => {
    const wrapper = mount(NotesPanel, { props: { notes: NOTES } })
    await buttonWith(wrapper, 'Edit').trigger('click')
    await wrapper.get('#note-edit-n1').setValue('props.items in the script')
    await wrapper.findAll('form')[0].trigger('submit') // the edit form, above "Add a note"
    const [[id, body, done]] = wrapper.emitted('save')
    expect([id, body]).toEqual(['n1', 'props.items in the script'])
    expect(wrapper.find('#note-edit-n1').exists()).toBe(true)
    done()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('#note-edit-n1').exists()).toBe(false)
  })

  it('asks before deleting a note', async () => {
    const wrapper = mount(NotesPanel, { props: { notes: NOTES }, attachTo: document.body })
    await buttonWith(wrapper, 'Delete').trigger('click')
    expect(wrapper.emitted('remove')).toBeUndefined()
    const confirm = [...document.body.querySelectorAll('button')].find((b) =>
      b.textContent.includes('Delete note'),
    )
    confirm.click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('remove')).toEqual([['n1']])
    wrapper.unmount()
  })
})
