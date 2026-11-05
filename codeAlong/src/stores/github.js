import { defineStore } from 'pinia'
import * as githubApi from '@/api/github.api'

// GitHub import (New lesson) and export (replay). no state: each page shows its own result.
// connecting a GitHub account is the auth store's job (connectGitHub, on the profile page).
export const useGithubStore = defineStore('github', () => ({
  importRepo: githubApi.importFromGithub,
  exportSession: githubApi.exportToGithub,
  connected: githubApi.hasGithubToken,
}))
