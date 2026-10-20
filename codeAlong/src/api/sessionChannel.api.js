import { supabase } from '@/lib/supabase'

// The live "radio channel" for one class: session:<id>. Owner: Ying Qi.
// Only class members can join it (the database checks). Clients only listen — messages
// are sent by the database functions (checkpoint:new, session:settings, session:ended…).
// A tab can only have ONE channel per class, so pages don't call this directly: the session
// store opens it, and pages use sessionStore.onChange(table, handler) for row changes.
//
//   const close = openSessionChannel(id, {
//     events: { [RtEvent.CHECKPOINT_NEW]: (payload) => … },
//     changes: { student_status: (row) => … },   // staff: rows changing in this class
//     presence: { userId, name },                 // students: say "I'm here"
//     onPresence: (people) => …,                  // staff: everyone currently here
//     onStatus: (status) => …,                    // 'live' | 'reconnecting' | 'offline'
//   })
//   close()   // when leaving the page

const STATUS = {
  SUBSCRIBED: 'live',
  CHANNEL_ERROR: 'reconnecting',
  TIMED_OUT: 'reconnecting',
  CLOSED: 'offline',
}

export function openSessionChannel(
  sessionId,
  { events = {}, changes = {}, presence, onPresence, onStatus } = {},
) {
  const channel = supabase.channel(`session:${sessionId}`, {
    config: { private: true, presence: { key: presence?.userId ?? '' } },
  })

  for (const [event, handler] of Object.entries(events)) {
    channel.on('broadcast', { event }, ({ payload }) => handler(payload))
  }
  // only rows this user may read arrive — the table's own rules apply
  for (const [table, handler] of Object.entries(changes)) {
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table, filter: `session_id=eq.${sessionId}` },
      ({ new: row }) => handler(row),
    )
  }
  // one entry per person, however many tabs they have open
  if (onPresence) {
    channel.on('presence', { event: 'sync' }, () =>
      onPresence(
        Object.values(channel.presenceState()).map(([p]) => ({ userId: p.userId, name: p.name })),
      ),
    )
  }

  // supabase-js reconnects by itself; this just reports where it's up to
  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED' && presence) channel.track(presence)
    onStatus?.(STATUS[status] ?? 'reconnecting')
  })

  return () => supabase.removeChannel(channel)
}
