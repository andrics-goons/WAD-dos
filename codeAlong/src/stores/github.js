import { defineStore } from 'pinia'
import * as githubApi from '@/api/github.api'

// GitHub import (New lesson) and export (replay). No state: each page shows its own result.
export const useGithubStore = defineStore('github', () => ({
  importRepo: githubApi.importFromGithub,
  connect: githubApi.linkGithub,
  exportSession: githubApi.exportToGithub,
}))
