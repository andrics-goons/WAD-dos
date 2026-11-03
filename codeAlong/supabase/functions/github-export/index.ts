// Entry point for github-export: wires the real clients into handler.ts.
// Reads the class as the caller (their own token), so RLS decides what they may export.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { isMockMode } from '../_shared/outbox.ts'
import { liveGithub, mockGithub } from '../_shared/github.ts'
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts'
import { handleExport } from './handler.ts'

const env = (key: string) => Deno.env.get(key)
const admin = supabaseAdmin() // only for writing test_outbox in mock mode

// A Supabase client that acts as whoever called the function
const asCaller = (req: Request) =>
  createClient(env('SUPABASE_URL')!, env('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('authorization') ?? '' } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

Deno.serve((req) =>
  handleExport(req, {
    async callerId(req) {
      const { data } = await asCaller(req).auth.getUser()
      return data.user?.id ?? null
    },
    async loadExport(req, sessionId, mine) {
      const db = asCaller(req)
      const { data: session } = await db
        .from('sessions')
        .select('lessons(title)')
        .eq('id', sessionId)
        .maybeSingle()
      if (!session) return null
      if (mine) {
        // my own autosave; the student_id filter keeps staff to their own, if they have one
        const { data: me } = await db.auth.getUser()
        const { data: snapshot, error } = await db
          .from('snapshots')
          .select('files')
          .eq('session_id', sessionId)
          .eq('student_id', me.user?.id ?? '')
          .eq('reason', 'autosave')
          .maybeSingle()
        if (error) throw error
        const checkpoints = snapshot
          ? [
              {
                files: snapshot.files,
                seq: 1,
                title: null,
                message: 'My code at the end of the class',
              },
            ]
          : []
        return { lessonTitle: session.lessons.title, checkpoints }
      }
      const { data: checkpoints, error } = await db
        .from('checkpoints')
        .select('files, seq, title')
        .eq('session_id', sessionId)
        .order('seq')
      if (error) throw error
      return { lessonTitle: session.lessons.title, checkpoints }
    },
    makeGithub: (token) => (isMockMode(env) ? mockGithub(admin, env) : liveGithub(fetch, token)),
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  }),
)
