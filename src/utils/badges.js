import { supabase } from '../lib/supabase'

export const BADGE_LABELS = {
  first_session:    'First Session',
  first_kettlebell: 'First Kettlebell',
  first_hiit:       'First HIIT',
  first_yoga:       'First Yoga',
  first_pilates:    'First Pilates',
  first_pr:         'First Personal Record',
  new_pr:           'New Personal Record',
  streak_3:         '3-Session Streak',
  streak_7:         '7-Session Streak',
  streak_14:        '14-Session Streak',
  weekly_goal:      'Weekly Goal Hit',
  first_bodyscan:   'First Body Scan',
  social_session:   'Training with Others',
  mindful_week:     'Mindful Week',
}

export async function checkAndAwardBadges(userId, {
  sessionType = null,
  isBodyScan = false,
  wasSocial = false,
} = {}) {
  const { data: existing } = await supabase
    .from('badges').select('badge_key').eq('user_id', userId)
  const earned = new Set((existing || []).map(b => b.badge_key))

  const { data: sessions } = await supabase
    .from('sessions_logged').select('date, session_type, social_context')
    .eq('user_id', userId).order('date', { ascending: false }).limit(50)

  const { data: prs } = await supabase
    .from('personal_records').select('id').eq('user_id', userId).limit(1)

  const award = async (key) => {
    if (earned.has(key)) return
    const { error } = await supabase.from('badges').insert({
      user_id: userId, badge_key: key,
      badge_label: BADGE_LABELS[key], date_earned: new Date().toISOString().slice(0, 10)
    })
    if (error) {
      console.error("Badge award error:", error.message, error.details, error.hint)
    } else earned.add(key)
  }

  const newBadges = []
  const origAward = award
  const trackingAward = async (key) => {
    if (!earned.has(key)) newBadges.push(BADGE_LABELS[key])
    await origAward(key)
  }

  if (sessions?.length >= 1) await trackingAward('first_session')
  if (sessionType === 'kettlebell') await trackingAward('first_kettlebell')
  if (sessionType === 'hiit_bodyweight') await trackingAward('first_hiit')
  if (sessionType === 'yoga') await trackingAward('first_yoga')
  if (sessionType === 'pilates') await trackingAward('first_pilates')
  if (prs?.length >= 1) await trackingAward('first_pr')
  if (isBodyScan) await trackingAward('first_bodyscan')

  const hasSocial = sessions.some(s => s.social_context === 'with_others') || wasSocial
  if (hasSocial) await trackingAward('social_session')

  const uniqueDates = (days) => {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days)
    const cutoffStr = cutoff.toISOString().slice(0, 10)
    return new Set(sessions.filter(s => s.date >= cutoffStr).map(s => s.date)).size
  }

  if (uniqueDates(7)  >= 3)  await trackingAward('streak_3')
  if (uniqueDates(14) >= 7)  await trackingAward('streak_7')
  if (uniqueDates(30) >= 14) await trackingAward('streak_14')
  if (uniqueDates(7)  >= 4)  await trackingAward('weekly_goal')

  // mindful_week: 3+ mindfulness sessions in the last 7 days (from sessions_logged)
  const sevenDaysAgo = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10)
  const mindfulThisWeek = (sessions || []).filter(
    s => s.session_type === 'mindfulness' && s.date >= sevenDaysAgo
  ).length
  if (mindfulThisWeek >= 3) await trackingAward('mindful_week')

  return newBadges
}
