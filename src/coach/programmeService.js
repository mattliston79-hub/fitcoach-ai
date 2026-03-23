/**
 * Programme service.
 *
 * Handles all Supabase reads and writes for the `programmes` and
 * `programme_sessions` tables.
 *
 * Every function returns { data, error } so callers can handle failures
 * gracefully without throwing.
 */

import { supabase } from '../lib/supabase'

/**
 * Creates a new programme row for the user.
 *
 * Before inserting, any existing programme with status 'active' for this user
 * is set to 'archived'.
 *
 * @param {string} userId
 * @param {object} programmeData - Fields matching the programmes table schema
 * @returns {Promise<{ data: object|null, error: object|null }>}
 */
export async function createProgramme(userId, programmeData) {
  try {
    // Archive any existing active programme for this user
    const { error: archiveError } = await supabase
      .from('programmes')
      .update({ status: 'archived', last_modified_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('status', 'active')

    if (archiveError) {
      console.error('[programmeService] Failed to archive existing programme:', archiveError.message)
      // Non-fatal — proceed with insert
    }

    const { data, error } = await supabase
      .from('programmes')
      .insert({ ...programmeData, user_id: userId })
      .select()
      .single()

    return { data: data || null, error: error || null }
  } catch (err) {
    console.error('[programmeService] createProgramme threw:', err.message)
    return { data: null, error: err }
  }
}

/**
 * Batch-inserts all session rows for a programme.
 *
 * Each session object must already contain programme_id and user_id.
 *
 * @param {string} programmeId
 * @param {string} userId
 * @param {Array<object>} sessions
 * @returns {Promise<{ data: Array|null, error: object|null }>}
 */
export async function saveProgrammeSessions(programmeId, userId, sessions) {
  try {
    const rows = sessions.map(s => ({ ...s, programme_id: programmeId, user_id: userId }))

    const { data, error } = await supabase
      .from('programme_sessions')
      .insert(rows)
      .select()

    return { data: data || null, error: error || null }
  } catch (err) {
    console.error('[programmeService] saveProgrammeSessions threw:', err.message)
    return { data: null, error: err }
  }
}

/**
 * Fetches the single active programme for a user.
 *
 * @param {string} userId
 * @returns {Promise<{ data: object|null, error: object|null }>}
 */
export async function getActiveProgramme(userId) {
  try {
    const { data, error } = await supabase
      .from('programmes')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle()

    return { data: data || null, error: error || null }
  } catch (err) {
    console.error('[programmeService] getActiveProgramme threw:', err.message)
    return { data: null, error: err }
  }
}

/**
 * Fetches all sessions for a given programme, ordered by week then session number.
 *
 * @param {string} programmeId
 * @returns {Promise<{ data: Array, error: object|null }>}
 */
export async function getProgrammeSessions(programmeId) {
  try {
    const { data, error } = await supabase
      .from('programme_sessions')
      .select('*')
      .eq('programme_id', programmeId)
      .order('week_number', { ascending: true })
      .order('session_number', { ascending: true })

    return { data: data || [], error: error || null }
  } catch (err) {
    console.error('[programmeService] getProgrammeSessions threw:', err.message)
    return { data: [], error: err }
  }
}

/**
 * Fetches the active programme and all its sessions for a user.
 *
 * If no active programme exists, returns { data: { programme: null, sessions: [] }, error: null }.
 *
 * @param {string} userId
 * @returns {Promise<{ data: { programme: object|null, sessions: Array }, error: object|null }>}
 */
export async function getFullProgramme(userId) {
  try {
    const { data: programme, error: progError } = await getActiveProgramme(userId)
    if (progError) return { data: { programme: null, sessions: [] }, error: progError }
    if (!programme)  return { data: { programme: null, sessions: [] }, error: null }

    const { data: sessions, error: sessError } = await getProgrammeSessions(programme.id)
    if (sessError) return { data: { programme, sessions: [] }, error: sessError }

    return { data: { programme, sessions }, error: null }
  } catch (err) {
    console.error('[programmeService] getFullProgramme threw:', err.message)
    return { data: { programme: null, sessions: [] }, error: err }
  }
}

/**
 * Updates the status field on a single programme_sessions row.
 *
 * @param {string} sessionId
 * @param {string} status - One of: 'planned' | 'complete' | 'skipped' | 'moved'
 * @returns {Promise<{ data: object|null, error: object|null }>}
 */
export async function updateSessionStatus(sessionId, status) {
  try {
    const { data, error } = await supabase
      .from('programme_sessions')
      .update({ status })
      .eq('id', sessionId)
      .select()
      .single()

    return { data: data || null, error: error || null }
  } catch (err) {
    console.error('[programmeService] updateSessionStatus threw:', err.message)
    return { data: null, error: err }
  }
}

/**
 * Links a programme session to a sessions_planned row and records its scheduled date.
 *
 * @param {string} programmeSessionId
 * @param {string} sessionsPlannedId
 * @param {string} scheduledDate - ISO date string YYYY-MM-DD
 * @returns {Promise<{ data: object|null, error: object|null }>}
 */
export async function linkSessionToPlanner(programmeSessionId, sessionsPlannedId, scheduledDate) {
  try {
    const { data, error } = await supabase
      .from('programme_sessions')
      .update({ sessions_planned_id: sessionsPlannedId, scheduled_date: scheduledDate })
      .eq('id', programmeSessionId)
      .select()
      .single()

    return { data: data || null, error: error || null }
  } catch (err) {
    console.error('[programmeService] linkSessionToPlanner threw:', err.message)
    return { data: null, error: err }
  }
}
