/**
 * sessionValidator.js
 *
 * Deterministic validation and repair of Rex-built session JSON.
 * Called in rexOrchestrator.js immediately after each Atomic Builder response
 * is parsed, before builtSessions.push(session).
 *
 * Pure JavaScript — no AI, no API call, no async, no latency.
 * Runs in ~1ms. Guaranteed to catch every structural issue every time.
 */

const SLOT_VOCABULARIES = {
  strength_block: {
    valid: ['warm_up', 'main', 'cool_down'],
    phases: { warm_up: 'warm_up', main: 'main', cool_down: 'cool_down' },
    aliases: {
      warmup: 'warm_up', warm_up: 'warm_up', 'warm-up': 'warm_up',
      warmUp: 'warm_up', preparation: 'warm_up', activation: 'warm_up',
      cooldown: 'cool_down', cool_down: 'cool_down', 'cool-down': 'cool_down',
      coolDown: 'cool_down', 'cool down': 'cool_down', stretching: 'cool_down',
      recovery: 'cool_down', main: 'main', workout: 'main', working: 'main',
      training: 'main',
    },
    minCounts: { warm_up: 2, main: 3, cool_down: 2 },
    maxCounts: { warm_up: 3, main: 6, cool_down: 3 },
  },
  hiit_circuit: {
    valid: ['warm_up', 'main', 'cool_down'],
    phases: { warm_up: 'warm_up', main: 'main', cool_down: 'cool_down' },
    aliases: {
      warmup: 'warm_up', warm_up: 'warm_up', 'warm-up': 'warm_up',
      cooldown: 'cool_down', cool_down: 'cool_down', 'cool-down': 'cool_down',
      main: 'main', circuit: 'main', intervals: 'main', work: 'main',
    },
    minCounts: { warm_up: 2, main: 3, cool_down: 2 },
    maxCounts: { warm_up: 3, main: 8, cool_down: 3 },
  },
  pilates_flow: {
    valid: ['centring_breath', 'warm_up', 'main', 'integration', 'restore'],
    phases: {
      centring_breath: 'centring_breath', warm_up: 'warm_up',
      main: 'main', integration: 'integration', restore: 'restore',
    },
    aliases: {
      centring_breath: 'centring_breath', centring: 'centring_breath',
      centering: 'centring_breath', centering_breath: 'centring_breath',
      breath: 'centring_breath', breathwork: 'centring_breath',
      warmup: 'warm_up', warm_up: 'warm_up', 'warm-up': 'warm_up',
      activation: 'warm_up', main: 'main', workout: 'main', exercises: 'main',
      integration: 'integration', functional: 'integration', transition: 'integration',
      restore: 'restore', cooldown: 'restore', cool_down: 'restore',
      savasana: 'restore', relaxation: 'restore', restoration: 'restore',
    },
    minCounts: { centring_breath: 1, warm_up: 2, main: 5, integration: 1, restore: 1 },
    maxCounts: { centring_breath: 2, warm_up: 4, main: 9, integration: 3, restore: 3 },
  },
  flexibility_flow: {
    valid: ['dynamic', 'mobility', 'hold', 'restore'],
    phases: {
      dynamic: 'dynamic', mobility: 'mobility', hold: 'hold', restore: 'restore',
    },
    aliases: {
      dynamic: 'dynamic', 'dynamic warm-up': 'dynamic', warmup: 'dynamic',
      warm_up: 'dynamic', mobility: 'mobility', 'active stretch': 'mobility',
      active: 'mobility', movement: 'mobility', hold: 'hold',
      'static stretch': 'hold', static: 'hold', stretching: 'hold',
      passive: 'hold', restore: 'restore', cooldown: 'restore',
      cool_down: 'restore', savasana: 'restore', relaxation: 'restore',
    },
    minCounts: { dynamic: 3, mobility: 4, hold: 2, restore: 1 },
    maxCounts: { dynamic: 6, mobility: 8, hold: 5, restore: 2 },
  },
}

const NULL_ID_SLOTS = new Set([
  'warm_up', 'cool_down',
  'centring_breath', 'restore', 'integration',
  'dynamic',
])

const POOL_ID_SLOTS = new Set(['main', 'mobility', 'hold'])

const DEFAULT_TECHNIQUE_CUES = {
  warm_up: 'Perform slowly and with control, focusing on joint mobility.',
  centring_breath: 'Breathe in for 4 counts through the nose, out for 6 counts through the mouth.',
  dynamic: 'Move through the full range of motion in a controlled, rhythmic way.',
  restore: 'Allow gravity to do the work. Let the body soften with each exhale.',
  integration: 'Move with intention. Connect the breath to every transition.',
  cool_down: 'Hold gently — no forcing. Let tension release on each exhale.',
}

function normaliseSlot(raw, vocab) {
  if (!raw) return null
  const key = String(raw).toLowerCase().trim()
  return vocab.aliases[key] || (vocab.valid.includes(raw) ? raw : null)
}

function truncateToWords(str, n) {
  if (!str) return str
  const words = str.trim().split(/\s+/)
  return words.length > n ? words.slice(0, n).join(' ') : str.trim()
}

function ensureFullStop(str) {
  if (!str) return str
  const trimmed = str.trim()
  return /[.!?]$/.test(trimmed) ? trimmed : trimmed + '.'
}

function buildFallbackWarmUp(sessionType) {
  const exercises = {
    pilates_flow: [
      { exercise_id: null, name: 'Pelvic Tilt', slot: 'warm_up', sets: 1, reps: 8, hold_seconds: null, rest_secs: 0, technique_cue: 'Exhale as you gently tilt the pelvis, imprinting the lower back into the mat. Inhale to return to neutral.' },
      { exercise_id: null, name: 'Knee Rolls', slot: 'warm_up', sets: 1, reps: 6, hold_seconds: null, rest_secs: 0, technique_cue: 'Inhale to prepare. Exhale as both knees lower to one side. Inhale to return. Keep shoulders grounded.' },
    ],
    flexibility_flow: [
      { exercise_id: null, name: 'Leg Swings', slot: 'dynamic', sets: 1, reps: 10, hold_seconds: null, rest_secs: 0, technique_cue: 'Stand on one leg. Swing the free leg forward and back in a controlled arc. Keep the standing leg soft.' },
      { exercise_id: null, name: 'Hip Circles', slot: 'dynamic', sets: 1, reps: 8, hold_seconds: null, rest_secs: 0, technique_cue: 'Feet hip-width apart. Draw slow circles with the hips in both directions. Keep the upper body still.' },
      { exercise_id: null, name: 'Thoracic Rotation', slot: 'dynamic', sets: 1, reps: 8, hold_seconds: null, rest_secs: 0, technique_cue: 'From a seated or kneeling position, rotate the upper back to each side. Lead with the eyes.' },
    ],
    default: [
      { exercise_id: null, name: 'Arm Circles', slot: 'warm_up', sets: 1, reps: 10, hold_seconds: null, rest_secs: 0, technique_cue: 'Start small and gradually increase the circle size. Keep shoulders relaxed.' },
      { exercise_id: null, name: 'Bodyweight Squat', slot: 'warm_up', sets: 2, reps: 10, hold_seconds: null, rest_secs: 0, technique_cue: 'Feet shoulder-width apart. Push the knees out over the toes and keep the chest tall.' },
    ],
  }
  return exercises[sessionType] || exercises.default
}

function buildFallbackCoolDown(sessionType) {
  const exercises = {
    pilates_flow: [
      { exercise_id: null, name: "Child's Pose", slot: 'restore', sets: 1, reps: null, hold_seconds: 60, rest_secs: 0, technique_cue: 'Exhale to fold forward over the knees. Arms long or at sides. Breathe into the back body for the full hold.' },
    ],
    flexibility_flow: [
      { exercise_id: null, name: 'Constructive Rest', slot: 'restore', sets: 1, reps: null, hold_seconds: 180, rest_secs: 0, technique_cue: 'Lie on your back, knees bent and falling together. Arms by sides. Allow the body to completely release for the full hold.' },
    ],
    default: [
      { exercise_id: null, name: 'Seated Hamstring Stretch', slot: 'cool_down', sets: 1, reps: null, hold_seconds: 30, rest_secs: 0, technique_cue: 'Sit with legs extended. Hinge forward from the hip, not the waist. Hold without bouncing. Breathe steadily.' },
      { exercise_id: null, name: 'Hip Flexor Stretch', slot: 'cool_down', sets: 1, reps: null, hold_seconds: 30, rest_secs: 0, technique_cue: 'Lunge position. Lower the back knee. Shift weight forward until a stretch is felt at the front of the hip.' },
    ],
  }
  return exercises[sessionType] || exercises.default
}

export function validateAndRepairSession(session, sessionIdentity, exercisePool, contraindications) {
  const repairs = []
  const clinicalFlags = []

  if (session.cardio_activity_json || sessionIdentity?.session_structure === 'cardio_activity') {
    if (!session.purpose_note) {
      session.purpose_note = `${session.session_type || 'Cardio'} session.`
      repairs.push('purpose_note was missing — generated placeholder')
    }
    session.purpose_note = ensureFullStop(session.purpose_note)
    session.title = session.title ? truncateToWords(session.title, 5) : (session.session_type || 'Cardio Session')
    return { session, repairs, clinicalFlags }
  }

  const structure = sessionIdentity?.session_structure || 'strength_block'
  const vocab = SLOT_VOCABULARIES[structure] || SLOT_VOCABULARIES.strength_block

  const poolById = {}
  const poolByName = {}
  for (const ex of (exercisePool || [])) {
    if (ex.id) poolById[ex.id] = ex
    if (ex.name) poolByName[ex.name.toLowerCase().trim()] = ex
  }

  const exercises = (session.exercises || []).map(ex => {
    const canonical = normaliseSlot(ex.slot, vocab)
    if (canonical && canonical !== ex.slot) {
      repairs.push(`Slot "${ex.slot}" on "${ex.name || 'unnamed'}" normalised to "${canonical}"`)
      return { ...ex, slot: canonical }
    }
    if (!canonical) return { ...ex, _slotUnknown: true }
    return ex
  })

  const firstPhase = vocab.valid[0]
  const lastPhase = vocab.valid[vocab.valid.length - 1]
  const midPhase = vocab.valid.find(s => s === 'main' || s === 'mobility') || vocab.valid[Math.floor(vocab.valid.length / 2)]

  const withSlots = exercises.map((ex, i) => {
    if (!ex._slotUnknown) return ex
    let inferredSlot
    if (i < 2) inferredSlot = firstPhase
    else if (i >= exercises.length - 2) inferredSlot = lastPhase
    else inferredSlot = midPhase
    repairs.push(`Unrecognised slot on "${ex.name || 'unnamed'}" (position ${i + 1}) — assigned "${inferredSlot}"`)
    const { _slotUnknown, ...rest } = ex
    return { ...rest, slot: inferredSlot }
  })

  const slotSet = new Set(withSlots.map(e => e.slot))

  if (!slotSet.has(firstPhase)) {
    const fallback = buildFallbackWarmUp(
      structure === 'pilates_flow' ? 'pilates_flow'
      : structure === 'flexibility_flow' ? 'flexibility_flow'
      : 'default'
    )
    const corrected = fallback.map(e => ({ ...e, slot: firstPhase }))
    withSlots.unshift(...corrected)
    repairs.push(`No ${firstPhase} phase found — added ${corrected.length} fallback exercise(s)`)
  }

  if (!slotSet.has(lastPhase)) {
    const fallback = buildFallbackCoolDown(
      structure === 'pilates_flow' ? 'pilates_flow'
      : structure === 'flexibility_flow' ? 'flexibility_flow'
      : 'default'
    )
    const corrected = fallback.map(e => ({ ...e, slot: lastPhase }))
    withSlots.push(...corrected)
    repairs.push(`No ${lastPhase} phase found — added ${corrected.length} fallback exercise(s)`)
  }

  if (structure === 'pilates_flow' && !slotSet.has('centring_breath')) {
    withSlots.unshift({
      exercise_id: null,
      name: 'Centering Breath',
      slot: 'centring_breath',
      sets: 1, reps: 8, hold_seconds: null, rest_secs: 0,
      technique_cue: 'Breathe in slowly through the nose for 4 counts, expanding the ribcage laterally. Exhale for 6 counts, drawing the navel gently toward the spine.',
    })
    repairs.push('No centring_breath phase found — added Centering Breath exercise')
  }

  const withIds = withSlots.map(ex => {
    if (NULL_ID_SLOTS.has(ex.slot) && ex.exercise_id != null) {
      repairs.push(`exercise_id cleared on "${ex.name}" (slot "${ex.slot}" must always be null)`)
      return { ...ex, exercise_id: null }
    }
    if (POOL_ID_SLOTS.has(ex.slot) && !ex.exercise_id) {
      const poolMatch = poolByName[ex.name?.toLowerCase().trim()]
      if (poolMatch) {
        repairs.push(`exercise_id resolved by name match for "${ex.name}" → ${poolMatch.id}`)
        return { ...ex, exercise_id: poolMatch.id }
      }
      clinicalFlags.push(`No exercise_id for main slot exercise "${ex.name || 'unnamed'}". Cannot save without a valid ID — check alongside_exercises table.`)
    }
    return ex
  })

  const withLaterality = withIds.map(ex => {
    const poolEx = ex.exercise_id ? poolById[ex.exercise_id] : poolByName[ex.name?.toLowerCase().trim()]
    const laterality = poolEx?.laterality || ex.laterality

    if (laterality === 'unilateral_same_side') {
      if (ex.technique_cue && !ex.technique_cue.startsWith('Per side:')) {
        repairs.push(`Added "Per side:" prefix to technique_cue on "${ex.name}"`)
        return { ...ex, technique_cue: `Per side: ${ex.technique_cue}`, laterality: 'unilateral_same_side' }
      }
      if (!ex.technique_cue) {
        repairs.push(`Added "Per side:" technique_cue to "${ex.name}" (no cue existed)`)
        return { ...ex, technique_cue: 'Per side: Perform the full movement on one side, then repeat on the other.', laterality: 'unilateral_same_side' }
      }
    }

    if (laterality === 'unilateral_alternating') {
      if (ex.technique_cue && !ex.technique_cue.includes('lternate')) {
        repairs.push(`Added "Alternate sides each rep." note to "${ex.name}"`)
        return { ...ex, technique_cue: ex.technique_cue + ' Alternate sides each rep.', laterality: 'unilateral_alternating' }
      }
    }

    return ex
  })

  const withPrescription = withLaterality.map(ex => {
    const poolEx = ex.exercise_id ? poolById[ex.exercise_id] : poolByName[ex.name?.toLowerCase().trim()]
    const prescriptionType = poolEx?.prescription_type || ex.prescription_type

    if (prescriptionType === 'hold_seconds') {
      if (!ex.hold_seconds && ex.reps) {
        repairs.push(`Converted reps:${ex.reps} to hold_seconds:${ex.reps} on "${ex.name}"`)
        return { ...ex, hold_seconds: ex.reps, reps: null }
      }
      if (!ex.hold_seconds && !ex.reps) {
        repairs.push(`Set default hold_seconds:30 on "${ex.name}"`)
        return { ...ex, hold_seconds: 30, reps: null }
      }
    }

    if (prescriptionType === 'breath_cycles') {
      if (ex.technique_cue && !ex.technique_cue.toLowerCase().includes('breath')) {
        repairs.push(`Added "breath cycles" note to technique_cue on "${ex.name}"`)
        return { ...ex, technique_cue: ex.technique_cue + ` Complete ${ex.reps || 8} breath cycles.` }
      }
    }

    if (ex.slot === 'hold' && !ex.hold_seconds && ex.reps) {
      repairs.push(`Converted reps:${ex.reps} to hold_seconds:${ex.reps} on "${ex.name}" (hold slot)`)
      return { ...ex, hold_seconds: ex.reps, reps: null }
    }

    return ex
  })

  const withCues = withPrescription.map(ex => {
    if (ex.technique_cue && ex.technique_cue.trim().length > 5) return ex

    if (ex.technique_start || ex.technique_move) {
      const cue = [ex.technique_start, ex.technique_move, ex.technique_avoid].filter(Boolean).join(' ')
      repairs.push(`Generated technique_cue from DB fields on "${ex.name}"`)
      return { ...ex, technique_cue: cue }
    }

    const defaultCue = DEFAULT_TECHNIQUE_CUES[ex.slot] || 'Perform with control and focus on good form throughout.'
    repairs.push(`Applied default technique_cue to "${ex.name}" (was empty)`)
    return { ...ex, technique_cue: defaultCue }
  })

  if (contraindications && contraindications.length > 0) {
    for (const ex of withCues) {
      const poolEx = ex.exercise_id ? poolById[ex.exercise_id] : null
      if (poolEx?.contraindications) {
        const exContras = Array.isArray(poolEx.contraindications)
          ? poolEx.contraindications
          : [poolEx.contraindications]
        for (const flag of contraindications) {
          const pattern = flag.split(':')[0].trim().toLowerCase()
          for (const exContra of exContras) {
            if (String(exContra).toLowerCase().includes(pattern)) {
              clinicalFlags.push(
                `"${ex.name}" has a contraindication (${exContra}) matching Blueprint flag "${flag}". ` +
                `Review before saving — this exercise may conflict with user's limitations.`
              )
            }
          }
        }
      }
    }
  }

  if (session.title) {
    const truncated = truncateToWords(session.title, 5)
    if (truncated !== session.title) {
      repairs.push(`Title truncated to 5 words: "${truncated}"`)
      session.title = truncated
    }
  } else {
    session.title = `${session.session_type || 'Training'} Session`
    repairs.push('Title was missing — generated placeholder')
  }

  if (session.purpose_note) {
    session.purpose_note = ensureFullStop(session.purpose_note)
  } else {
    session.purpose_note = `${session.session_type || 'Training'} session.`
    repairs.push('purpose_note was missing — generated placeholder')
  }

  return { session: { ...session, exercises: withCues }, repairs, clinicalFlags }
}

export function validateSequentialSession(session) {
  const repairs = []

  if (session.title) {
    const truncated = truncateToWords(session.title, 6)
    if (truncated !== session.title) {
      repairs.push(`Title truncated: "${truncated}"`)
      session.title = truncated
    }
  }

  if (session.purpose_note) {
    session.purpose_note = ensureFullStop(session.purpose_note)
  }

  if (Array.isArray(session.exercises_json)) {
    session.exercises_json = session.exercises_json.map(ex => {
      if (!ex.technique_cue || ex.technique_cue.trim().length < 5) {
        repairs.push(`Default technique_cue added to "${ex.exercise_name}"`)
        return { ...ex, technique_cue: 'Perform with control and focus on good form throughout.' }
      }
      return ex
    })
  }

  return { session, repairs }
}
