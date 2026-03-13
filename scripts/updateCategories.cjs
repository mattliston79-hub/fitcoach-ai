/**
 * scripts/updateCategories.cjs
 *
 * 1. Bulk-updates all 1,324 exercises to the new 9 category names
 * 2. Inserts 10 Injury Awareness & Load Management exercises
 *
 * Prerequisites:
 *   - Run supabase/migrations/005_category_to_text.sql in Supabase SQL editor first
 *   - SUPABASE_SERVICE_ROLE_KEY must be set in .env
 */

const fs   = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

// ── Load .env ──────────────────────────────────────────────────────────────
const env = {}
fs.readFileSync(path.join(__dirname, '../.env'), 'utf8')
  .split('\n')
  .forEach(line => {
    const idx = line.indexOf('=')
    if (idx > 0) env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
  })

const SUPABASE_URL = env.VITE_SUPABASE_URL
const SERVICE_KEY  = env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY || SERVICE_KEY.length < 20) {
  console.error('❌  Missing credentials. Set SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY)

// ── Categorisation function ────────────────────────────────────────────────
function categorize(ex) {
  const n = ex.name.toLowerCase()

  if (n.startsWith('kettlebell')) return 'Kettlebell'

  const cardioExact = ['run','run (equipment)','short stride run','walk elliptical cross trainer',
    'wheel run','hands bike','ski ergometer','wind sprints','stationary bike walk']
  if (cardioExact.includes(n)) return 'Cardiovascular'
  if (n.includes('treadmill') || n.includes('elliptical cross') || n.includes('stepmill') ||
      n.includes('stationary bike') || n.includes('cycle cross trainer')) return 'Cardiovascular'

  const powerTerms = ['jump squat','box jump','plyo','drop jump','power clean','snatch pull',
    'squat jerk','clean and press','one arm snatch','barbell thruster','dumbbell push press',
    'forward jump','backward jump','lunge with jump','kneeling jump squat',
    'medicine ball catch','medicine ball chest pass','medicine ball chest push',
    'medicine ball overhead slam','medicine ball supine chest throw','one arm slam',
    'tire flip','sledge hammer','clap push','dumbbell clean','dumbbell plyo squat',
    'dumbbell one arm snatch']
  if (powerTerms.some(t => n.includes(t))) return 'Power & Plyometrics'
  if (n === 'battling ropes' || n === 'power clean' || n === 'snatch pull') return 'Power & Plyometrics'

  const hiitTerms = ['burpee','mountain climber','jump rope','skater hop',
    'scissor jump','jack jump','jack burpee','semi squat jump',
    'bear crawl','push to run','walking high knees','high knee against wall',
    'back and forth step','ski step','swing 360']
  if (hiitTerms.some(t => n.includes(t))) return 'HIIT'
  if (n === 'star jump (male)' || n === 'astride jumps (male)') return 'HIIT'

  const flexTerms = ['stretch','ankle circles','wrist circles','wrist rollerer','piriformis',
    'inchworm','world greatest','neck side stretch','rocking frog',
    'runners stretch','iron cross stretch','kneeling lat stretch','overhead triceps stretch',
    'peroneals stretch','posterior tibialis stretch','rear deltoid stretch',
    'side lying floor stretch','side push neck stretch','side wrist pull stretch',
    'all fours squad stretch','back pec stretch','behind head chest stretch',
    'chest and front of shoulder stretch','circles knee stretch','dynamic chest stretch',
    'reclining big toe pose','basic toe touch','upward facing dog','sphinx',
    'hug knees to chest','side-to-side toe touch','arms apart circular toe touch',
    'hands clasped circular toe touch','hands reversed clasped circular toe touch',
    'crab twist toe touch','two toe touch']
  if (flexTerms.some(t => n.includes(t))) return 'Flexibility & Mobility'
  if (n.startsWith('roller') && n !== 'roller body saw' && n !== 'roller reverse crunch')
    return 'Flexibility & Mobility'
  if ((n.includes('exercise ball') || n.includes('stability ball')) &&
      (n.includes('stretch') || n.includes('hip flexor') || n.includes('lat stretch') ||
       n.includes('lower back stretch') || n.includes('hug')))
    return 'Flexibility & Mobility'
  if (n.includes('hip internal rotation') || n.includes('hip external rotation'))
    return 'Flexibility & Mobility'
  const flexExact = ['pelvic tilt','pelvic tilt into bridge','spine stretch','spine twist',
    'chest stretch with exercise ball','seated lower back stretch',
    'exercise ball lower back stretch (pyramid)','monster walk','standing pelvic tilt']
  if (flexExact.includes(n)) return 'Flexibility & Mobility'

  const coreTerms = ['crunch','sit-up','plank','russian twist','flutter kicks',
    'dead bug','v-sit','l-sit','jackknife','cocoons','leg raise','oblique',
    'butt-ups','rollerout','rollout','hanging leg','hanging straight',
    'hanging oblique','hanging pike','captains chair','bicycle crunch',
    'cable twist','cable side bend','suspended abdominal','suspended reverse',
    'leg hip raise','seated crunch','kneeling crunch','standing crunch']
  if (coreTerms.some(t => n.includes(t))) return 'Core, Yoga & Pilates'
  const yogaExact = ['butterfly yoga pose','seated wide angle pose sequence',
    'reclining big toe pose with rope','skin the cat']
  if (yogaExact.includes(n)) return 'Core, Yoga & Pilates'
  const coreExact = ['air bike','barbell seated twist','barbell standing twist',
    'alternate heel touchers','3/4 sit-up','curl-up',
    'frog crunch','groin crunch','half sit-up (male)','janda sit-up','kick out sit',
    'knee touch crunch','negative crunch','quarter sit-up','otis up',
    'prisoner half sit-up (male)','tuck crunch','elbow-to-knee','elevator',
    'flexion leg sit up (bent knee)','flexion leg sit up (straight arm)',
    'seated leg raise','seated side crunch (wall)','leg pull in flat bench',
    'lying leg raise flat bench','glute bridge march','single leg bridge with outstretched leg',
    'hip raise (bent knee)','low glute bridge on floor','body-up',
    'side bridge hip abduction','side bridge v. 2','power point plank','front plank with twist',
    'twist hip lift','twisted leg raise','twisted leg raise (female)',
    'bodyweight incline side plank','side hip (on parallel bars)',
    'swimmer kicks v. 2 (male)','isometric wipers','isometric chest squeeze',
    'prone twist on stability ball','pull-in (on stability ball)',
    'roller body saw','roller reverse crunch',
    'band alternating v-up','band bicycle crunch','band horizontal pallof press',
    'band jack knife sit-up','band kneeling twisting crunch','band lying straight leg raise',
    'band push sit-up','band seated twist','band standing crunch',
    'band standing twisting crunch','band v-up','band vertical pallof press',
    'assisted motion russian twist','exercise ball prone leg raise',
    'arm slingers hanging bent knee legs','arm slingers hanging straight legs',
    'side plank hip adduction','straight leg outer hip abductor','incline twisting sit-up',
    'kneeling plank tap shoulder (male)','lunge with twist','squat to overhead reach',
    'squat to overhead reach with twist','march sit (wall)']
  if (coreExact.includes(n)) return 'Core, Yoga & Pilates'

  if (n.includes('bosu') || n === 'quick feet v. 2' || n === 'balance board') return 'Coordination & Agility'
  if (n === 'left hook (boxing)') return 'Coordination & Agility'
  if ((n.includes('exercise ball') || n.includes('stability ball') ||
       n.includes('on exercise ball') || n.includes('on stability ball') ||
       n.includes('(on stability ball)')) &&
      !n.includes('stretch') && !n.includes('lat stretch') && !n.includes('hip flexor') &&
      !n.includes('lower back stretch') && !n.includes('hug'))
    return 'Coordination & Agility'
  if (n.includes('medicine ball')) return 'Power & Plyometrics'

  return 'Strength & Hypertrophy'
}

// ── Injury Awareness exercises to insert ──────────────────────────────────
const INJURY_EXERCISES = [
  {
    name: 'Banded Clamshell',
    category: 'Injury Awareness & Load Management',
    muscles_primary: ['glutes'],
    muscles_secondary: ['hip abductors'],
    experience_level: 'novice',
    source: 'manual',
    description_start: 'Lie on your side with hips and knees bent to 45 degrees. Loop a resistance band just above your knees. Keeping your feet together, slowly rotate your top knee upward as far as you can without rotating your pelvis. Hold for one second at the top, then lower under control. This is a foundational hip rehab exercise for glute medius weakness, IT band issues, and knee tracking problems.',
    description_move: 'Drive the movement from your glute, not your hip flexor. Your pelvis should remain perfectly still throughout. Think of opening like a clamshell.',
    description_avoid: 'Do not let your pelvis rock backward as your knee rises. Do not use momentum — the movement should be slow and controlled. Do not allow your top foot to rise off the bottom foot.',
  },
  {
    name: 'Copenhagen Plank',
    category: 'Injury Awareness & Load Management',
    muscles_primary: ['adductors'],
    muscles_secondary: ['core', 'glutes'],
    experience_level: 'intermediate',
    source: 'manual',
    description_start: 'Set up in a side plank position with your top foot resting on a bench or box. Your bottom leg hangs freely. Support your body on your forearm and the inside of your top leg. Hold this position with your body in a straight line from head to heel. This exercise targets the adductors — one of the most commonly neglected muscle groups in injury prevention, particularly for groin strains.',
    description_move: 'Squeeze your adductor to keep the hip lifted. Keep the core braced and body in a rigid plank. To progress, lift the bottom leg to meet the top leg.',
    description_avoid: 'Do not allow the hips to sag. Do not place undue pressure on the knee joint — if you feel knee discomfort, lower the bench height or switch to a short Copenhagen plank with the knee on the bench.',
  },
  {
    name: 'Nordic Hamstring Curl',
    category: 'Injury Awareness & Load Management',
    muscles_primary: ['hamstrings'],
    muscles_secondary: ['glutes', 'calves'],
    experience_level: 'advanced',
    source: 'manual',
    description_start: 'Kneel on a mat with your ankles secured under a bar, partner, or fixed object. Start upright. Slowly lower your torso toward the floor by allowing your knees to extend, using your hamstrings eccentrically to control the descent. Lower as far as you can control, then push off the floor with your hands and pull yourself back up using your hamstrings. This is one of the most evidence-based exercises for hamstring injury prevention.',
    description_move: 'The eccentric phase (lowering) is the priority. Go as slowly as possible. Your body should remain in a straight line from knee to shoulder throughout.',
    description_avoid: 'Do not collapse quickly to the floor. Do not arch the lower back. Beginners should place hands on the floor early in the descent and use the push-off as a training aid until eccentric strength improves.',
  },
  {
    name: 'Tibialis Raise',
    category: 'Injury Awareness & Load Management',
    muscles_primary: ['tibialis anterior'],
    muscles_secondary: ['peroneals'],
    experience_level: 'novice',
    source: 'manual',
    description_start: 'Stand with your heels on a low step or plate, heels together and toes hanging off the edge. Keeping your legs straight, dorsiflex your ankles to raise your toes as high as possible. Hold briefly at the top, then lower slowly. This is a key exercise for preventing shin splints, improving ankle stability, and addressing anterior tibial stress in runners and field sport athletes.',
    description_move: 'Focus on pulling the toes up toward your shins. You should feel the muscle along the front of your shin working.',
    description_avoid: 'Do not bend the knees. Do not rush the movement — the eccentric lowering is as important as the lift.',
  },
  {
    name: 'Dead Hang',
    category: 'Injury Awareness & Load Management',
    muscles_primary: ['lats', 'rotator cuff'],
    muscles_secondary: ['forearms', 'traps'],
    experience_level: 'novice',
    source: 'manual',
    description_start: 'Grip a pull-up bar with an overhand or mixed grip, hands slightly wider than shoulder-width. Allow your body to hang completely freely, letting your shoulder blades rise passively. Breathe steadily and hold for 20–60 seconds. Dead hangs decompress the spine, restore shoulder mobility, and are used in shoulder rehabilitation programmes for impingement and rotator cuff issues.',
    description_move: 'Start with a passive hang (shoulders relaxed). Progress to an active hang by depressing the shoulder blades without bending the elbows.',
    description_avoid: 'Do not kip or swing. If you have acute shoulder pain, start with shorter durations and consult a physiotherapist before progressing.',
  },
  {
    name: 'Wall Slide',
    category: 'Injury Awareness & Load Management',
    muscles_primary: ['rotator cuff', 'lower traps'],
    muscles_secondary: ['serratus anterior'],
    experience_level: 'novice',
    source: 'manual',
    description_start: 'Stand with your back, head, and both arms flat against a wall. Bend elbows to 90 degrees so forearms are vertical. Slowly slide both arms upward along the wall, maintaining contact with the wall throughout. Slide as high as you can without losing contact, then return. This exercise re-educates scapular movement patterns and is widely used in shoulder rehab for impingement, rotator cuff strains, and poor posture.',
    description_move: 'Move slowly and with full control. Focus on keeping your lower back flat against the wall and your ribcage down.',
    description_avoid: 'Do not allow your lower back to arch away from the wall. Do not shrug your shoulders up to your ears. If your arms lose contact with the wall, you have reached your current range — do not force it.',
  },
  {
    name: 'Terminal Knee Extension',
    category: 'Injury Awareness & Load Management',
    muscles_primary: ['quadriceps (VMO)'],
    muscles_secondary: ['hamstrings'],
    experience_level: 'novice',
    source: 'manual',
    description_start: 'Attach a resistance band to a fixed point and loop it behind your knee. Stand facing away from the anchor point with a slight bend in the knee. Starting with the knee bent, straighten the knee fully against band resistance, squeezing the VMO (inner quad). Hold for one second, then slowly bend back. This exercise is a cornerstone of knee rehab, particularly for ACL recovery, patellofemoral pain, and post-operative strengthening.',
    description_move: 'Focus on the final degrees of knee extension — the last 15 degrees. You should feel the VMO (the teardrop-shaped muscle above the kneecap) contract strongly.',
    description_avoid: 'Do not hyperextend the knee. Do not allow the foot to turn out. Keep the movement isolated to the knee — the hip and ankle should stay still.',
  },
  {
    name: 'Single Leg Balance',
    category: 'Injury Awareness & Load Management',
    muscles_primary: ['tibialis anterior', 'peroneals'],
    muscles_secondary: ['glutes', 'core'],
    experience_level: 'novice',
    source: 'manual',
    description_start: 'Stand barefoot on one leg with a slight bend in the knee. Maintain your balance for 30–60 seconds. Progress by closing your eyes, standing on an unstable surface, or adding small arm movements. This foundational proprioception exercise is used in ankle sprain rehabilitation, knee stabilisation programmes, and as a general movement quality assessment tool.',
    description_move: 'Keep a slight bend in the standing knee. Focus on a fixed point to help with balance. Progress gradually — eyes open on flat surface → eyes closed → eyes open on unstable surface.',
    description_avoid: 'Do not lock the knee out straight. Do not grip the floor aggressively with your toes. If you cannot hold for 10 seconds, practise with a finger lightly touching a wall for support.',
  },
  {
    name: 'Hip 90/90 Mobility',
    category: 'Injury Awareness & Load Management',
    muscles_primary: ['hip external rotators', 'hip internal rotators'],
    muscles_secondary: ['glutes', 'adductors'],
    experience_level: 'novice',
    source: 'manual',
    description_start: 'Sit on the floor with both knees bent to 90 degrees — one leg in front (hip externally rotated) and one leg behind (hip internally rotated). Sit tall and upright. Hold this position for 60–90 seconds, then switch sides. This position exposes hip mobility restrictions that contribute to lower back pain, hip impingement, and knee tracking problems. It is used extensively in movement screening and hip rehabilitation.',
    description_move: 'Try to sit upright without rounding the lower back. You should feel a stretch in the glute of the front leg and the hip flexor or inner thigh of the back leg.',
    description_avoid: 'Do not collapse forward if the stretch is too intense — sit on a small block or cushion to reduce the demand. Do not force the back knee to the floor if your hip is restricted.',
  },
  {
    name: 'Prone Hip Extension',
    category: 'Injury Awareness & Load Management',
    muscles_primary: ['glutes'],
    muscles_secondary: ['hamstrings', 'erector spinae'],
    experience_level: 'novice',
    source: 'manual',
    description_start: 'Lie face down on a mat with legs straight and arms folded under your forehead. Keeping your knee straight, squeeze your glute and lift one leg a few inches off the floor. Hold for 2 seconds, then lower under control. Alternate legs. This exercise activates the glutes in a prone position, making it ideal for people with lower back pain or those who have difficulty feeling their glutes in standing exercises. It is commonly used in early-stage lower back and hip rehabilitation.',
    description_move: 'The movement should come entirely from glute contraction — not from arching the lower back. The lift should be small (5–10 cm) but controlled.',
    description_avoid: 'Do not rotate the pelvis. Do not arch the lower back to get extra height. If you feel your lower back working more than your glute, reduce the range of motion.',
  },
]

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  // 1. Fetch all existing exercises
  console.log('📥  Fetching exercises from Supabase…')
  let all = []
  let from = 0
  while (true) {
    const { data, error } = await sb.from('exercises').select('id,name,category').range(from, from + 499)
    if (error) { console.error('Fetch error:', error); process.exit(1) }
    all = all.concat(data)
    if (data.length < 500) break
    from += 500
  }
  console.log(`   Found ${all.length} exercises\n`)

  // 2. Build updates
  const updates = all.map(ex => ({ id: ex.id, category: categorize(ex) }))

  // 3. Group by new category and update each group with .in('id', [...])
  console.log('✏️   Updating categories…')
  const byNewCat = {}
  for (const u of updates) {
    if (!byNewCat[u.category]) byNewCat[u.category] = []
    byNewCat[u.category].push(u.id)
  }
  let updated = 0
  for (const [category, ids] of Object.entries(byNewCat)) {
    // Supabase .in() supports up to 1000 ids; chunk just in case
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500)
      const { error } = await sb.from('exercises').update({ category }).in('id', chunk)
      if (error) {
        console.error(`  ❌ Failed updating "${category}":`, error.message)
        if (error.message.includes('invalid input value for enum') ||
            error.message.includes('violates check constraint')) {
          console.error('\n⚠️  The category column is still an enum type.')
          console.error('   Please run supabase/migrations/005_category_to_text.sql in the Supabase SQL editor first.\n')
          process.exit(1)
        }
      } else {
        updated += chunk.length
        process.stdout.write(`  ✓ Updated ${updated} / ${all.length}…\r`)
      }
    }
  }
  console.log(`\n  ✓ All ${updated} exercises updated\n`)

  // 4. Insert Injury Awareness exercises
  console.log('🩹  Inserting Injury Awareness & Load Management exercises…')
  const { data: inserted, error: insertError } = await sb
    .from('exercises')
    .insert(INJURY_EXERCISES)
    .select('name')
  if (insertError) {
    console.error('  ❌ Insert error:', insertError.message)
  } else {
    inserted.forEach(r => console.log('  ✓ ' + r.name))
  }

  // 5. Summary
  const { data: counts } = await sb.from('exercises').select('category')
  const tally = {}
  for (const row of counts) tally[row.category] = (tally[row.category] || 0) + 1
  console.log('\n─────────────────────────────────────────')
  console.log('✅  Done. Final category distribution:\n')
  for (const [cat, n] of Object.entries(tally).sort((a, b) => b[1] - a[1]))
    console.log(`  ${String(n).padStart(4)}  ${cat}`)
}

main()
