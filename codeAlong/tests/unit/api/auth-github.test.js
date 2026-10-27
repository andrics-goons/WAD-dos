// @vitest-environment jsdom
// The GitHub half of auth.api.js against a fake Supabase client: the real round trip needs
// GitHub itself, so these check what we ask Supabase for and how we read its answers.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as authApi from '@/api/auth.api'

const auth = vi.hoisted(() => ({}))
const profile = vi.hoisted(() => ({ id: 'u1', name: 'Alex Tan', role: 'student' }))
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth,
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: profile }) }) }) }),
  },
}))

const EMAIL = { provider: 'email', identity_data: {} }
const GITHUB = { provider: 'github', identity_data: { user_name: 'alextan' } }
const identities = (...list) => ({ data: { identities: list }, error: null })

beforeEach(() => {
  auth.signInWithOAuth = vi.fn(async () => ({ error: null }))
  auth.linkIdentity = vi.fn(async () => ({ error: null }))
  auth.unlinkIdentity = vi.fn(async () => ({ error: null }))
  auth.getUserIdentities = vi.fn(async () => identities(EMAIL))
})

describe('GitHub sign-in and linking', () => {
  it('"Continue with GitHub" comes back to where they were heading', async () => {
    await authApi.signInWithGitHub('/enrol/WAD2G2')
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'github',
      options: { redirectTo: `${window.location.origin}/enrol/WAD2G2` },
    })
  })

  it('"Connect GitHub" asks for public repo access and comes back to the profile', async () => {
    await authApi.connectGitHub()
    expect(auth.linkIdentity).toHaveBeenCalledWith({
      provider: 'github',
      options: { scopes: 'public_repo', redirectTo: `${window.location.origin}/profile` },
    })
  })

  it('no GitHub identity means not connected', async () => {
    expect(await authApi.getGitHubLink()).toBeNull()
  })

  it('a linked GitHub shows its username, and can be disconnected while email still logs in', async () => {
    auth.getUserIdentities.mockResolvedValue(identities(EMAIL, GITHUB))
    expect(await authApi.getGitHubLink()).toEqual({ username: 'alextan', canDisconnect: true })
  })

  it("GitHub can't be disconnected when it's the only way to log in", async () => {
    auth.getUserIdentities.mockResolvedValue(identities(GITHUB))
    expect(await authApi.getGitHubLink()).toEqual({ username: 'alextan', canDisconnect: false })
  })

  it('disconnecting unlinks the GitHub identity, not the email one', async () => {
    auth.getUserIdentities.mockResolvedValue(identities(EMAIL, GITHUB))
    await authApi.disconnectGitHub()
    expect(auth.unlinkIdentity).toHaveBeenCalledWith(GITHUB)
  })

  it('a Supabase refusal becomes an AppError', async () => {
    auth.linkIdentity.mockResolvedValue({
      error: { message: 'Manual linking is disabled', status: 404 },
    })
    await expect(authApi.connectGitHub()).rejects.toMatchObject({ name: 'AppError' })
  })

  it('an account made with GitHub has no password to change; an email one does', async () => {
    auth.getUser = async () => ({
      data: { user: { id: 'u1', app_metadata: { providers: ['github'] } } },
    })
    expect((await authApi.getCurrentUser()).hasPassword).toBe(false)
    auth.getUser = async () => ({
      data: { user: { id: 'u1', app_metadata: { providers: ['email', 'github'] } } },
    })
    expect(await authApi.getCurrentUser()).toEqual({ ...profile, hasPassword: true })
  })
})
