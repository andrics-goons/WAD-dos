// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import HelpRequestCard from '@/components/help/HelpRequestCard.vue'

const NOW = Date.parse('2026-10-26T10:30:00Z')
const request = (changes = {}) => ({
  id: 'r1',
  type: 'help',
  status: 'open',
  claimed_by: null,
  message: 'Vite says it cannot find ItemCard?',
  in_person: false,
  seat: null,
  follow_ups: 0,
  thread: [],
  created_at: '2026-10-26T10:18:00Z',
  student: { name: 'Bea Koh' },
  checkpoint_seq: 3,
  ...changes,
})
const mountCard = (changes, props = {}) =>
  mount(HelpRequestCard, {
    props: {
      request: request(changes),
      staffNames: { ana: 'Ana Lim', ben: 'Ben Ong' },
      myId: 'ana',
      now: NOW,
      canAct: true,
      ...props,
    },
  })

describe('HelpRequestCard', () => {
  it('shows who, which checkpoint, what kind and how long they have waited — no code', () => {
    const text = mountCard().text()
    expect(text).toContain('Bea Koh')
    expect(text).toContain('Help · Checkpoint 3')
    expect(text).toContain('12 min')
    expect(text).toContain('Waiting')
  })

  it('an open request has a Claim button that claims without opening the card', async () => {
    const wrapper = mountCard()
    await wrapper.find('[data-testid="btn-claim"]').trigger('click')
    expect(wrapper.emitted('claim')).toHaveLength(1)
    expect(wrapper.emitted('open')).toBeUndefined()
  })

  it('no Claim button once claimed, or for an admin looking in', () => {
    expect(
      mountCard({ status: 'claimed', claimed_by: 'ben' })
        .find('[data-testid="btn-claim"]')
        .exists(),
    ).toBe(false)
    expect(mountCard({}, { canAct: false }).find('[data-testid="btn-claim"]').exists()).toBe(false)
  })

  it('says who has claimed it', () => {
    expect(mountCard({ status: 'claimed', claimed_by: 'ben' }).text()).toContain(
      'Ben Ong is on this',
    )
    expect(mountCard({ status: 'claimed', claimed_by: 'ana' }).text()).toContain("You're on this")
  })

  it('a follow-up is badged with who handled it last, and waits from the follow-up', () => {
    const wrapper = mountCard({
      follow_ups: 1,
      thread: [
        { role: 'staff', author_id: 'ana', body: 'Try the capital C', at: '2026-10-26T10:20:00Z' },
        { role: 'student', author_id: 'bea', body: 'Still broken', at: '2026-10-26T10:28:00Z' },
      ],
    })
    expect(wrapper.find('[data-testid="badge-follow-up"]').text()).toBe(
      'Follow-up · last handled by Ana Lim',
    )
    expect(wrapper.text()).toContain('2 min')
  })

  it('an in-person request shows the seat', () => {
    expect(mountCard({ in_person: true, seat: 'B12' }).text()).toContain('In person · seat B12')
  })
})
