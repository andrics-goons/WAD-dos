// @vitest-environment node
import { describe, it, expect, afterAll } from 'vitest'
import { userClient, service, cleanup, anonClient } from './_helpers.js'

afterAll(cleanup)

describe('issue_telegram_link_code', () => {
  it('T-TG-01: saves a code that works for 10 minutes, and returns the link that carries it', async () => {
    const ana = await userClient({ name: 'Ana Link' })

    const { data: link, error } = await ana.client.rpc('issue_telegram_link_code')
    expect(error).toBeNull()

    const { data: profile } = await service
      .from('profiles')
      .select('telegram_link_code, telegram_link_code_expires_at')
      .eq('id', ana.id)
      .single()
    expect(link).toBe(`https://t.me/TeleHelpbot?start=${profile.telegram_link_code}`)
    const minutesLeft = (Date.parse(profile.telegram_link_code_expires_at) - Date.now()) / 60000
    expect(minutesLeft).toBeGreaterThan(9)
    expect(minutesLeft).toBeLessThanOrEqual(10)
  })

  it('T-TG-01: asking again replaces the code, and it only ever touches my own profile', async () => {
    const ana = await userClient({ name: 'Ana Again' })
    const bob = await userClient({ name: 'Bob Other' })
    const codeOf = async (user) =>
      (await service.from('profiles').select('telegram_link_code').eq('id', user.id).single()).data
        .telegram_link_code

    await ana.client.rpc('issue_telegram_link_code')
    const first = await codeOf(ana)
    await ana.client.rpc('issue_telegram_link_code')

    expect(await codeOf(ana)).not.toBe(first)
    expect(await codeOf(bob)).toBeNull()
  })

  it('T-TG-01: a logged-out visitor gets nothing', async () => {
    const { data, error } = await anonClient().rpc('issue_telegram_link_code')
    expect(data).toBeNull()
    expect(error).not.toBeNull()
  })
})
