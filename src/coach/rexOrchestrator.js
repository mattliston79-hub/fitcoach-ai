/**
 * Rex plan generation orchestrator.
 *
 * Coordinates the 3-phase pipeline:
 *
 *   Phase 1 — Rex reasons about the week (taxonomy + user context only).
 *              Returns a JSON object with session requirements: which days,
 *              which muscles, what intensity. No exercises yet.
 *
 *   Phase 2 — App queries the DB using Rex's requirements. Supabase returns
 *              only exercises that match each session's category and muscles.
 *
 *   Phase 3 — Rex receives the targeted exercise pools and builds the full
 *              programme + sessions JSON. Returns { programme, sessions[] }.
 *
 * After Phase 3 the orchestrator:
 *   - Calls createProgramme to persist the programme row (archives any existing active one)
 *   - Calls saveProgrammeSessions to batch-insert all session rows
 *
 * The callClaude and supabase dependencies are injected so this module can
 * be tested in isolation without live API or DB connections.
 */

import { buildContext }                        from './buildContext'
import { buildRexPlanContext, queryExercises } from './rexPlanning'
import { buildPhase1Prompt, buildPhase3Prompt } from './trainerPrompt'
import { createProgramme, saveProgrammeSessions } from './programmeService'

/**
 * Generates a weekly training plan using Rex's 3-phase reasoning pipeline,
 * then saves the result to the `programmes` and `programme_sessions` tables.
 *
 * @param {string}  userId    - Authenticated user's UUID
 * @param {object}  supabase  - Supabase client instance
 * @param {(systemPrompt: string, userMessage: string, maxTokens?: number) => Promise<string>} callClaude
 *   Accepts a system prompt string and a user message string.
 *   Returns the assistant's text response.
 *
 * @returns {Promise<{ programme: object, sessions: Array }>}
 *   The newly created programme row and all saved session rows.
 *   Returns { programme: null, sessions: [] } if Phase 3 produces no parseable output.
 *
 * @throws If Phase 1 JSON parsing fails (logged + rethrown with descriptive message).
 * @throws If taxonomy or user context fetches fail.
 */
export async function generateRexPlan(userId, supabase, callClaude) {
  try {

    // ── Fetch user context and exercise taxonomy in parallel ────────────────
    const [contextResult, taxonomyString] = await Promise.all([
      buildContext(userId, 'rex'),
      buildRexPlanContext(userId, supabase),
    ])

    const userContext = contextResult.contextString

    // ── PHASE 1: Rex reasons about session requirements ─────────────────────
    // Rex sees only the taxonomy and user context — no exercises yet.
    // Outputs a JSON object: { sessions: [{ day, session_type, muscles, ... }] }

    const phase1System  = buildPhase1Prompt(userContext, taxonomyString)
    const phase1Message = 'Generate a weekly plan based on my profile.'
    const phase1Raw     = await callClaude(phase1System, phase1Message)

    let sessionRequirements
    try {
      const cleaned = phase1Raw.replace(/```[a-z]*\n?/g, '').replace(/```/g, '').trim()
      const parsed  = JSON.parse(cleaned)
      sessionRequirements = parsed.sessions
      if (!Array.isArray(sessionRequirements) || sessionRequirements.length === 0) {
        throw new Error('sessions array is empty or missing')
      }
    } catch (parseErr) {
      console.error('[generateRexPlan] Phase 1 JSON parse failed. Raw response:', phase1Raw)
      throw new Error(`Phase 1 JSON parsing failed: ${parseErr.message}`)
    }

    // ── PHASE 2: Fetch targeted exercises per session ───────────────────────
    // queryExercises tries precise (category + level + muscles) then falls back
    // to category + level only. Logs which path was used to Vercel function logs.

    const sessionPools = await Promise.all(
      sessionRequirements.map(async session => {
        const exercises = await queryExercises(
          {
            category:         session.session_type,
            experience_level: session.experience_level,
            muscles:          session.muscles || [],
          },
          supabase
        )
        return { ...session, exercises }
      })
    )

    // ── PHASE 3: Rex builds the full plan ───────────────────────────────────
    // Rex receives only the exercises that matched each session's requirements.
    // Outputs { programme: {...}, sessions: [...] }

    const phase3System  = buildPhase3Prompt(userContext, sessionPools)
    const phase3Message = 'Build the full plan using these exercises.'
    const phase3Raw     = await callClaude(phase3System, phase3Message, 8192)

    let plan
    try {
      const cleaned = phase3Raw.replace(/```[a-z]*\n?/g, '').replace(/```/g, '').trim()
      const parsed  = JSON.parse(cleaned)

      if (!parsed.programme || !Array.isArray(parsed.sessions)) {
        throw new Error('Phase 3 output missing "programme" or "sessions" keys')
      }
      plan = parsed
    } catch (parseErr) {
      console.error('[generateRexPlan] Phase 3 JSON parse failed. Raw response:', phase3Raw)
      throw new Error(`Phase 3 JSON parsing failed: ${parseErr.message}`)
    }

    // ── Save to DB ──────────────────────────────────────────────────────────
    // 1. Create programme row (archives any existing active programme for this user)
    const { data: programmeRow, error: progError } = await createProgramme(userId, plan.programme)
    if (progError || !programmeRow) {
      throw new Error(`Failed to save programme: ${progError?.message || 'no row returned'}`)
    }

    // 2. Batch-insert all session rows
    const { data: sessionRows, error: sessError } = await saveProgrammeSessions(
      programmeRow.id,
      userId,
      plan.sessions
    )
    if (sessError) {
      throw new Error(`Failed to save programme sessions: ${sessError.message}`)
    }

    console.log(
      `[generateRexPlan] Saved programme "${programmeRow.title}" ` +
      `(${programmeRow.id}) with ${(sessionRows || []).length} sessions for user ${userId}`
    )

    return { programme: programmeRow, sessions: sessionRows || [] }

  } catch (err) {
    console.error('[generateRexPlan] Plan generation failed:', err.message)
    throw err
  }
}
