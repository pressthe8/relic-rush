// This is the v1 pool: keep its order and contents fixed so UID mappings stay stable.
export const EXPLORER_NAMES = [
  'Anning', 'Shackleton', 'Amundsen', 'Hillary', 'Cousteau', 'Kingsley', 'Fiennes', 'Humboldt',
  'Jones', 'Croft', 'Drake', 'Fogg', 'Lidenbrock', 'Hawkins', 'Grant', 'Hunt'
] as const

export function generateGuestName(uid: string): string {
  if (!uid) throw new Error('A guest UID is required to generate a name.')
  // FNV-1a uses the full UID, rather than just the visible suffix, to select a name.
  let hash = 2166136261
  for (let i = 0; i < uid.length; i++) hash = Math.imul(hash ^ uid.charCodeAt(i), 16777619)
  return `${EXPLORER_NAMES[(hash >>> 0) % EXPLORER_NAMES.length]}-${uid.slice(0, 6)}`
}
