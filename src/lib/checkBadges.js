import { supabase } from './supabase'

// Mirror of Dashboard's calcStreak — keeps this file self-contained
function calcStreak(sessions) {
  if (!sessions.length) return 0
  const unique = [...new Set(sessions.map(s => s.date))].sort().reverse()
  const today = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10)
  let streak = 0
  let cursor = unique[0] === today ? today : (unique[0] === yesterday ? yesterday : null)
  if (!cursor) return 0
  for (const date of unique) {
    if (date === cursor) {
      streak++
      const d = new Date(cursor)
      d.setDate(d.getDate() - 1)
      cursor = d.toISOString().slice(0, 10)
    } else if (date < cursor) {
      break
    }
  }
  return streak
}

const MINDFUL_TYPES = new Set(['yoga', 'pilates', 'flexibility'])
const HIIT_TYPES    = new Set(['hiit_bodyweight', 'plyometrics'])
const STRENGTH_TYPES = new Set(['kettlebell', 'gym_strength', 'coordination'])

/**
 * Check which milestone badges the user has earned but not yet received,
 * insert them, and return the newly awarded badge rows.
 *
 * @param {string} userId
 * @param {string} sessionType - type of the session just completed
 * @param {object} [context]
 * @param {boolean} [context.hasNewPr] - true when a PR was beaten this session
 * @returns {Promise<Array>} newly awarded badge objects with {name, description, icon_emoji}
 */
export async function checkAndAwardBadges(userId, sessionType, context = {}) {
  const [allSessionsRes, earnedRes, badgesRes] = await Promise.all([
    supabase
      .from('sessions_logged')
      .select('date, session_type')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(120),

    supabase
      .from('user_badges')
      .select('badge_id')
      .eq('user_id', userId),

    supabase
      .from('badges')
      .select('id, name, description, icon_emoji, trigger_key')
      .not('trigger_key', 'is', null),
  ])

  const allSessions = allSessionsRes.data ?? []
  const earnedIds   = new Set((earnedRes.data ?? []).map(r => r.badge_id))
  const badges      = badgesRes.data ?? []

  const count  = allSessions.length
  const streak = calcStreak(allSessions)

  const hasType = (types) => allSessions.some(s => types.has(s.session_type))

  const shouldEarn = (key) => {
    switch (key) {
      case 'session_1':     return count >= 1
      case 'session_5':     return count >= 5
      case 'session_10':    return count >= 10
      case 'streak_3':      return streak >= 3
      case 'streak_7':      return streak >= 7
      case 'first_mindful': return MINDFUL_TYPES.has(sessionType) || hasType(MINDFUL_TYPES)
      case 'first_hiit':    return HIIT_TYPES.has(sessionType)    || hasType(HIIT_TYPES)
      case 'first_strength':return STRENGTH_TYPES.has(sessionType)|| hasType(STRENGTH_TYPES)
      case 'first_pr':      return context.hasNewPr === true
      default:              return false
    }
  }

  const toAward = badges.filter(b => !earnedIds.has(b.id) && shouldEarn(b.trigger_key))
  if (!toAward.length) return []

  const rows = toAward.map(b => ({
    user_id:   userId,
    badge_id:  b.id,
    earned_at: new Date().toISOString(),
  }))

  const { error } = await supabase.from('user_badges').insert(rows)
  if (error) {
    console.error('Badge insert error:', error)
    return []
  }

  return toAward
}
