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

  it('adds a note, trimmed, and clears the box', async () => {
    const wrapper = mount(NotesPanel)
    await wrapper.get('#note-new').setValue('  watch needs deep: true  ')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('add')).toEqual([['watch needs deep: true']])
    expect(wrapper.get('#note-new').element.value).toBe('')
  })

  it("won't send a blank note", async () => {
    const wrapper = mount(NotesPanel)
    await wrapper.get('#note-new').setValue('   ')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('add')).toBeUndefined()
    expect(wrapper.get('.ca-field-error').text()).toBe('Write something first')
  })

  it('edits and deletes a note', async () => {
    const wrapper = mount(NotesPanel, { props: { notes: NOTES } })
    await buttonWith(wrapper, 'Edit').trigger('click')
    await wrapper.get('#note-edit-n1').setValue('props.items in the script')
    await wrapper.findAll('form')[0].trigger('submit') // the edit form, above "Add a note"
    expect(wrapper.emitted('save')).toEqual([['n1', 'props.items in the script']])

    await buttonWith(wrapper, 'Delete').trigger('click')
    expect(wrapper.emitted('remove')).toEqual([['n1']])
  })
})
