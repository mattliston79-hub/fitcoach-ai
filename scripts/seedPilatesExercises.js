// scripts/seedPilatesExercises.js
//
// Seeds the exercises table with all Pilates mat exercises.
// Sources:
//   1. Joseph Pilates: 34 Classic Mat Exercises (performance order)
//   2. Pilates Exercise Progressions — Lynne Joyner (2020)
//
// Run: node scripts/seedPilatesExercises.js
// Or:  npm run seed:pilates
//
// UPSERT-safe on (name, category) — safe to run multiple times.

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function mapLevel(level) {
  if (!level) return 'all';
  const l = level.toLowerCase();
  if (l.includes('advanced')) return 'advanced';
  if (l.includes('intermediate')) return 'intermediate';
  if (l.includes('beginner')) return 'novice';
  return 'all';
}

function positionToMovementPattern(position, name) {
  const p = (position || '').toLowerCase();
  const n = (name || '').toLowerCase();
  // Back extension movements → hinge
  if (p.includes('prone') && (n.includes('swan') || n.includes('dart') || n.includes('rocking') || n.includes('swimming') || n.includes('opposite'))) return 'hinge';
  // Seated rotation movements → rotate
  if (p.includes('seated') && (n.includes('saw') || n.includes('twist') || n.includes('spine twist'))) return 'rotate';
  // Push pattern
  if (n.includes('push up')) return 'push';
  // Everything else in Pilates is controlled static/isometric work
  return 'static';
}

function splitInstructions(instructions, precautions) {
  const sentences = instructions.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/).filter(Boolean);
  const third = Math.max(1, Math.floor(sentences.length / 3));
  const twoThirds = Math.max(third + 1, Math.floor((sentences.length * 2) / 3));
  return {
    description_start: sentences.slice(0, third).join(' ') || instructions,
    description_move: sentences.slice(third, twoThirds).join(' ') || '',
    description_avoid: precautions
      ? `Avoid if: ${precautions}`
      : sentences.slice(twoThirds).join(' ') || 'Avoid rushing — prioritise control over speed.',
  };
}

const EXERCISES = [
  // ── 34 CLASSICAL MAT EXERCISES ──────────────────────────────────────
  { name: 'Hundred', position: 'Supine', level: 'Advanced',
    muscles_primary: ['rectus abdominis', 'transversus abdominis'], muscles_secondary: ['hip flexors', 'shoulders'],
    benefits: 'Increase blood circulation. Good warmup. Increase abdominal strength.',
    instructions: 'Lie on your back. Arms by sides with palms on the mat. Bend knees towards the chest. Curl up head, neck and shoulders. Hover arms up to the height of the abdominal wall. Extend legs long to 45 degrees. Heels together and toes apart (Pilates stance). Vigorously pump arms up and down. Inhale through the mouth for 5 counts and exhale through the mouth for 5 counts (one set). Bring head and feet down to the mat. Repeat.',
    precautions: 'Shoulder tightness.' },
  { name: 'Roll Up', position: 'Supine', level: 'Advanced',
    muscles_primary: ['rectus abdominis', 'obliques'], muscles_secondary: ['hamstrings', 'hip flexors'],
    benefits: 'Strengthen abdominals. Increase spinal mobility.',
    instructions: 'Lie flat on the back with legs together. Reach arms overhead shoulder-width apart. Palms facing forward. Inhale, reach overhead and curl head and shoulders off the mat. Exhale, peel spine off the mat, rounding forward and bringing the crown of the head towards knees. Keep arms parallel to the mat. Abdominals draw into the spine. Inhale, roll back down to start. Repeat.',
    precautions: 'Neck and shoulder tightness.' },
  { name: 'Roll Over', position: 'Supine', level: 'Intermediate',
    muscles_primary: ['rectus abdominis', 'transversus abdominis'], muscles_secondary: ['lower back', 'glutes'],
    benefits: 'Strengthen abs. Increase spinal mobility.',
    instructions: 'Lie on the back with legs together. Arms by side. Draw abs towards the mat. Inhale, lift legs to 90 degrees. Exhale, reach legs up and over (C curve in the spine). Slowly lower the legs one vertebra at a time to the mat.',
    precautions: 'Shoulder and back pain.' },
  { name: 'One Leg Circles', position: 'Supine', level: 'Beginner',
    muscles_primary: ['hip flexors', 'quadriceps'], muscles_secondary: ['hamstrings', 'transversus abdominis'],
    benefits: 'Pelvic stabilisation. Mobilisation of the hip joint. Strengthens quads and hamstrings. Engages the core.',
    instructions: 'Lay flat on back with arms by side. One leg straight on the mat with foot flexed and the other leg up towards the ceiling. Circle top leg across the body, down, and around while keeping pelvis stable for 5 circles. Reverse circle in the other direction. Repeat on the other leg.',
    precautions: 'Lower back issues.' },
  { name: 'Rolling Back', position: 'Seated', level: 'Beginner',
    muscles_primary: ['rectus abdominis', 'transversus abdominis'], muscles_secondary: ['erector spinae'],
    benefits: 'Stimulates and massages the spine.',
    instructions: 'Sit with knees bent. Feet flat on the floor. Hands hold the front of knees. Bring forehead towards knees — you look like a ball. Stay a ball as you roll back to the tips of the shoulder blades. Return to the start by engaging abdominals as the brake. Balance in the start position. Repeat.',
    precautions: 'Neck or spine injury.' },
  { name: 'One Leg Stretch', position: 'Supine', level: 'Beginner',
    muscles_primary: ['rectus abdominis', 'obliques'], muscles_secondary: ['hip flexors'],
    benefits: 'Strengthen abdominals.',
    instructions: 'Lie on your back. Curl head and shoulders off the mat. Bend both knees into the chest. Extend one leg straight as you place both hands on the opposite shin. Outside hand near the ankle, inside hand near the knee. Switch legs, extending the opposite leg straight and pulling the opposite knee into your hands. Continue switching legs.',
    precautions: 'Back injury.' },
  { name: 'Double Leg Stretch', position: 'Supine', level: 'Beginner',
    muscles_primary: ['rectus abdominis', 'transversus abdominis'], muscles_secondary: ['hip flexors'],
    benefits: 'Strengthen abs.',
    instructions: 'Lie on your back. Stretch legs away from you. Keep legs squeezed together and toes pointed. Pull legs back into Tabletop position. Repeat. Lower head and legs to mat.',
    precautions: 'Neck and spine injuries.' },
  { name: 'Spine Stretch', position: 'Seated', level: 'Beginner',
    muscles_primary: ['erector spinae', 'hamstrings'], muscles_secondary: ['rectus abdominis'],
    benefits: 'Spinal articulation. Strengthens hip extensors.',
    instructions: 'Sit tall. Straighten legs. Flex feet. Reach arms forward parallel to the mat. Palms face down. Exhale, roll forward through spine. Draw abs in. Keep arms parallel to the mat. Inhale, roll up stacking spine to return to start.',
    precautions: 'Back injury.' },
  { name: 'Rocker With Open Legs', position: 'Seated', level: 'Intermediate',
    muscles_primary: ['rectus abdominis', 'transversus abdominis'], muscles_secondary: ['hip flexors', 'erector spinae'],
    benefits: 'Stimulates and massages the spine. Strengthens abdominal muscles. Improves posture and balance.',
    instructions: 'Balance on sit bones. Knees bent. Grasp hands around ankles. Straighten one leg then the other into a V. Tip pubic bone towards the nose to initiate rock back to shoulder blades and rock back to start position.',
    precautions: 'Back injury.' },
  { name: 'Corkscrew', position: 'Supine', level: 'Intermediate',
    muscles_primary: ['obliques', 'rectus abdominis'], muscles_secondary: ['hip flexors', 'shoulders'],
    benefits: 'Strengthen abs and shoulders. Pelvic stabilisation. Hip flexor stretch. Lower back massage.',
    instructions: 'Lie on your back. Press arms into the mat. Legs together. Lift legs straight to the ceiling. Roll over bringing legs parallel to the floor, with hips and feet level. Inhale, shift both legs to the right. Roll down through right side of back. Exhale, circle legs around and roll over through left side of back, returning legs to start. Reverse.',
    precautions: 'Back injury.' },
  { name: 'Saw', position: 'Seated', level: 'Intermediate',
    muscles_primary: ['obliques', 'hamstrings'], muscles_secondary: ['rectus abdominis', 'erector spinae'],
    benefits: 'Strengthen abdominals. Increases spinal articulation. Hamstring and hip stretch.',
    instructions: 'Sit tall with legs wider than hips, feet flexed. Arms stretched out to sides at shoulder height. Inhale, grow tall. Exhale, rotate torso to one side reaching the opposite hand past the little toe. Inhale, return to centre. Exhale, rotate to other side. Repeat.',
    precautions: 'Back injury.' },
  { name: 'Swan Dive', position: 'Prone', level: 'Advanced',
    muscles_primary: ['erector spinae', 'glutes'], muscles_secondary: ['hamstrings', 'rhomboids'],
    benefits: 'Strengthen back and hip extensors.',
    instructions: 'Lie on stomach with legs together. Hands by head. Lift abs away from floor while sending tailbone to the floor. Press through hands into Swan, maintaining a long spine and lengthened neck. Release arms to side as body rocks forward. Maintaining the arc position, the legs will lift up. Rock back onto thighs, lifting chest. Repeat.',
    precautions: 'Neck or lower back injury.' },
  { name: 'One Leg Kick', position: 'Prone', level: 'Beginner',
    muscles_primary: ['hamstrings', 'glutes'], muscles_secondary: ['erector spinae'],
    benefits: 'Back extensors, hamstrings, glutes.',
    instructions: 'Lie on stomach with legs straight and together. Prop yourself onto forearms, bringing elbows underneath shoulders. Kick one heel into your seat two times, reach the leg straight, and place it on the mat. Switch legs.',
    precautions: 'Lower back injury.' },
  { name: 'Double Leg Kick', position: 'Prone', level: 'Intermediate',
    muscles_primary: ['hamstrings', 'glutes', 'erector spinae'], muscles_secondary: ['rhomboids', 'triceps'],
    benefits: 'Stretches upper body. Tones lower body. Back and hip extensors.',
    instructions: 'Lie on stomach. Turn head to place one cheek on mat. Place hands clasped and high up on back, elbows dropping towards the mat. Kick both heels to the seat 3 times. Extend both legs straight as hands reach to feet while finding a back extension. Lower torso and turn head to place opposite cheek on mat. Repeat.',
    precautions: 'Neck and spine injuries.' },
  { name: 'Neck Pull', position: 'Supine', level: 'Advanced',
    muscles_primary: ['rectus abdominis', 'erector spinae'], muscles_secondary: ['obliques', 'hip flexors'],
    benefits: 'Strengthen abs and back extensors.',
    instructions: 'Lie on back. Glue spine to mat. Place both hands at base of neck. Inhale, lift head and shoulders. Exhale, roll off mat bringing crown of head to knees. Inhale, stack spine up to seated. Exhale, tuck chin to chest, tuck tailbone, round spine down to mat.',
    precautions: 'Neck and shoulder injury.' },
  { name: 'Scissors', position: 'Inverted', level: 'Advanced',
    muscles_primary: ['rectus abdominis', 'hip flexors'], muscles_secondary: ['shoulders', 'hamstrings'],
    benefits: 'Abdominal, shoulder, and hip flexibility.',
    instructions: 'Lie on back. Bend both knees in and roll through spine, reaching both legs parallel to the floor, then bend knees towards chest. Place hands high on back. Reach both legs to ceiling. Lower one straight leg to mat as you draw opposite straight leg towards your chest. Pulse the top leg towards you two times. Switch legs.',
    precautions: 'Low back pain. Tight hip flexors. Neck injury. Pregnancy.' },
  { name: 'Bicycle', position: 'Inverted', level: 'Advanced',
    muscles_primary: ['obliques', 'rectus abdominis'], muscles_secondary: ['hip flexors', 'erector spinae'],
    benefits: 'Increases spine mobility. Core control.',
    instructions: 'Lie on your back. Arms at the side. Straighten legs to the ceiling. Peel spine off the floor one vertebra at a time. Hands at top of the pelvis. Split legs with knees straight and toes pointed. Bend front knee towards the face. Exhale and pedal front foot away from the face. Straighten the knee as you bring your back leg towards the face. Switch directions.',
    precautions: 'Osteoporosis. Glaucoma. Neck or shoulder injuries.' },
  { name: 'Shoulder Bridge', position: 'Supine', level: 'Intermediate',
    muscles_primary: ['glutes', 'hamstrings'], muscles_secondary: ['erector spinae', 'transversus abdominis'],
    benefits: 'Strengthen hamstrings and glutes.',
    instructions: 'Lie on back with knees bent. Feet hip distance apart. Peel tailbone and spine off the mat. Extend right leg to ceiling with foot pointed. Lower right leg towards the ground, flex foot and bring leg back to the ceiling. Repeat. Place right foot down. Repeat with left leg. Roll spine and tailbone down to the mat to finish.',
    precautions: 'Neck and shoulder pain.' },
  { name: 'Spine Twist', position: 'Seated', level: 'Beginner',
    muscles_primary: ['obliques', 'erector spinae'], muscles_secondary: ['transversus abdominis'],
    benefits: 'Strengthen obliques and back extensors.',
    instructions: 'Sit with legs together in front. Feet flexed. Raise arms to the side at shoulder height. Sit tall. Inhale, reach crown of head to ceiling. Exhale, twist torso to right, growing taller on the twist and pulsing twice. Inhale, return to centre. Exhale, twist torso to left, pulsing twice. Repeat.',
    precautions: 'Neck or shoulder injury.' },
  { name: 'Jack Knife', position: 'Inverted', level: 'Advanced',
    muscles_primary: ['rectus abdominis', 'erector spinae'], muscles_secondary: ['shoulders', 'hip flexors'],
    benefits: 'Strengthens abs, back, arms, legs and shoulders.',
    instructions: 'Lie on back. Arms by sides. Palms down. Legs together. Extend both legs to ceiling. Draw abs in. Roll over through spine to take both legs almost parallel to floor. Maintaining lift of pelvis and tailbone to ceiling, reach both legs straight to ceiling. Keeping feet over hips, articulate through spine to roll down to the mat.',
    precautions: 'Neck or shoulder injury.' },
  { name: 'Side Kick', position: 'Side-lying', level: 'Beginner',
    muscles_primary: ['glutes', 'hip abductors'], muscles_secondary: ['rectus abdominis', 'erector spinae'],
    benefits: 'Strengthen glutes, hips, abs, back extensors.',
    instructions: 'Lie on right side in a straight line from shoulders to ankles. Prop head on right hand. Place left palm flat on the mat in front of your chest. Move both legs in front of hips on a slight diagonal. Lift top leg off bottom leg, and kick it forward twice. Lengthen leg as you sweep it to kick back. Perform 5 reps. Repeat on other side.',
    precautions: 'Neck or shoulder injury.' },
  { name: 'Teaser', position: 'Supine', level: 'Advanced',
    muscles_primary: ['rectus abdominis', 'transversus abdominis'], muscles_secondary: ['hip flexors', 'erector spinae'],
    benefits: 'Abdominal and back extensor strength. Trunk stabilization.',
    instructions: 'Lie on your back. Elevate legs so thighs are perpendicular to the body and knees are bent parallel with the body. Extend arms behind you. Inhale, lift arms towards legs, while lifting head for max reach; at the same time, straighten legs in the air. Exhale, make the body a V shape. Inhale, return to start by rolling the body back.',
    precautions: 'Spine injury.' },
  { name: 'Hip Twist', position: 'Seated', level: 'Advanced',
    muscles_primary: ['obliques', 'rectus abdominis'], muscles_secondary: ['erector spinae', 'hip flexors'],
    benefits: 'Strengthen abs, obliques and back extensors.',
    instructions: 'Sit tall with legs straight and together. Place hands on floor behind you. Point fingers away from body. Float both legs off mat to Teaser position. Circle both legs right, down, around, and back to start. Reverse circle in other direction.',
    precautions: 'Shoulder tightness.' },
  { name: 'Swimming', position: 'Prone', level: 'Intermediate',
    muscles_primary: ['erector spinae', 'glutes'], muscles_secondary: ['hamstrings', 'rhomboids', 'shoulders'],
    benefits: 'Strengthens muscles on back of body: buttocks, thighs, back.',
    instructions: 'Lie flat on your belly with arms stretched out in front. Legs outstretched behind. Squeeze inner thighs and heels together. Pull navel up off the mat. Raise the upper back and head off the mat slightly and simultaneously lift the right arm and left leg off the mat. Squeeze buttocks and press pubic bone down into the mat. Switch arms and legs and begin swimming.',
    precautions: 'Neck injury.' },
  { name: 'Leg Pull Front', position: 'Prone (plank)', level: 'Intermediate',
    muscles_primary: ['transversus abdominis', 'rectus abdominis'], muscles_secondary: ['shoulders', 'glutes', 'hip flexors'],
    benefits: 'Core strength builder.',
    instructions: 'Start on knees. Place hands on floor in front. Keep arms straight and elbows unlocked. Engage abs. Lean forward, weight on hands. Shoulders over wrists. With abs lifted, extend legs back straight and together. Toes curled under. Ears, shoulders, hips and heels in one long line. Extend one leg up as far as you can without rotating hips. Return foot to mat and extend other leg.',
    precautions: 'Arm, neck or shoulder injury.' },
  { name: 'Leg Pull', position: 'Supine (reverse plank)', level: 'Intermediate',
    muscles_primary: ['transversus abdominis', 'glutes'], muscles_secondary: ['triceps', 'hip flexors'],
    benefits: 'Core strength builder.',
    instructions: 'Sit with legs crossed. Bring hands behind back. Fingers point towards buttocks. Extend legs long and lift hips. All weight supported by wrists. Lift right leg up and down. Lift left leg up and down. Engage inner thighs and lower abs when lifting.',
    precautions: 'Neck and shoulder injury.' },
  { name: 'Side Kick Kneeling', position: 'Kneeling', level: 'Intermediate',
    muscles_primary: ['glutes', 'hip abductors'], muscles_secondary: ['obliques', 'transversus abdominis'],
    benefits: 'Strengthen the torso and glutes. Improve balance.',
    instructions: 'Kneel onto the right knee. Place your right hand on the mat underneath the right shoulder. Left knee in line with the left foot. Right hip directly over the right knee. Place left hand behind head. Kick left leg forward and back while keeping torso stable. Place the left knee onto the mat and repeat on the other side.',
    precautions: 'Knee injury.' },
  { name: 'Side Bend', position: 'Side-lying / Side plank', level: 'Intermediate',
    muscles_primary: ['obliques', 'transversus abdominis'], muscles_secondary: ['shoulders', 'hip abductors'],
    benefits: 'Abdominal strength. Shoulder stabilisation.',
    instructions: 'Sit sideways with legs bent to one side. Top foot in front of the bottom foot (or stacked). Place supporting hand in line with seated hip a few inches in front of shoulder. Press into supporting hand, straighten legs to lift pelvis away from mat, making a rainbow shape with body.',
    precautions: 'Shoulder or neck tightness.' },
  { name: 'Boomerang', position: 'Seated', level: 'Advanced',
    muscles_primary: ['rectus abdominis', 'obliques'], muscles_secondary: ['hip flexors', 'erector spinae'],
    benefits: 'Strengthen abs. Stabilise hips. Massage spine.',
    instructions: 'Sit tall. Extend legs. Right ankle crossed over left. Palms by hips. Lift both legs. Roll over to 90-degree angle. Open and close legs, switching cross of ankles. Roll down through spine to balance in Teaser. Clasp hands behind tailbone, maintain Teaser as you lower legs to mat. Circle arms overhead. Bring hands to ankles. Roll to sitting.',
    precautions: 'Neck injury. Spine injury. Osteoporosis. Glaucoma.' },
  { name: 'Seal', position: 'Seated', level: 'Beginner',
    muscles_primary: ['transversus abdominis', 'rectus abdominis'], muscles_secondary: ['erector spinae'],
    benefits: 'Trunk stabilisation. Spinal massage.',
    instructions: 'Sit with hips close to feet, knees bent. Lace hands between legs. Hold onto outsides of ankles. Feet together. Knees shoulder distance apart. Make C-curve with spine. Balance with feet off mat. Clap feet together 3 times. Inhale, roll back to balance on shoulder blades. Clap feet 3 times. Exhale, roll through spine to return to start.' },
  { name: 'Crab', position: 'Seated', level: 'Advanced',
    muscles_primary: ['rectus abdominis', 'obliques'], muscles_secondary: ['transversus abdominis', 'erector spinae'],
    benefits: 'Spinal mobility. Strengthens core, rectus abdominus, obliques.',
    instructions: 'Sit with legs crossed. Core engaged. Hold onto feet. Tilt pelvis. Roll sit bones under with a posterior pelvic tilt. Roll back maintaining this shape and leg position. Go no further than tops of shoulders. Keep heels pressed towards backs of legs. Return to balance without feet touching floor.',
    precautions: 'Neck and spine injuries.' },
  { name: 'Rocking', position: 'Prone', level: 'Advanced',
    muscles_primary: ['erector spinae', 'glutes'], muscles_secondary: ['hamstrings', 'quadriceps'],
    benefits: 'Strengthen back extensors, glutes, hamstrings. Increase spinal mobility.',
    instructions: 'Lay on stomach. Arms by side. Head to one side. Bend knees. Hold onto both ankles. Press ankles into hands. Lift chest and knees away from mat by engaging backs of legs and back extensors. Maintain shape as you rock forward and back.',
    precautions: 'Shoulder, back or neck injury.' },
  { name: 'Control Balance', position: 'Inverted', level: 'Advanced',
    muscles_primary: ['hip flexors', 'transversus abdominis'], muscles_secondary: ['glutes', 'hamstrings'],
    benefits: 'Strengthens hip extensors, core. Improves hip flexibility.',
    instructions: 'Lay on back with arms by side. Extend both legs to ceiling. Roll over and place balls of feet into mat. Circle arms around and place both hands on right foot. Extend left leg up. Without changing position of hips or torso, place ball of left foot onto mat and extend right leg to ceiling.',
    precautions: 'Neck and spine injuries.' },
  { name: 'Push Up (Pilates)', position: 'Standing to Prone', level: 'Intermediate',
    muscles_primary: ['triceps', 'pectorals'], muscles_secondary: ['transversus abdominis', 'upper back'],
    benefits: 'Strengthens triceps, chest, and upper back.',
    instructions: 'Stand with feet together. Roll down through spine and place hands on mat. Walk hands out until shoulders are over wrists and body is in plank position. Bend elbows towards ribs in a tricep push up. Repeat 5 times. Lift pelvis. Walk hands back to feet. Roll up through spine to standing.',
    precautions: 'Shoulder, wrist, elbow, or neck injury.' },

  // ── PROGRESSIVE SERIES ──────────────────────────────────────────────
  { name: 'Ab Prep', position: 'Supine', level: 'Beginner',
    muscles_primary: ['transversus abdominis', 'rectus abdominis'], muscles_secondary: ['pelvic floor'],
    benefits: 'Core activation. Neutral spine awareness.',
    instructions: 'Lie on back in neutral spine. Engage abdominals. Inhale to prepare. Exhale, curl head and shoulders off mat. Inhale to lower. Focus on engaging pelvic floor on exhalation.',
    precautions: 'Neck pain.' },
  { name: 'Curl Up', position: 'Supine', level: 'Beginner',
    muscles_primary: ['rectus abdominis'], muscles_secondary: ['pelvic floor', 'transversus abdominis'],
    benefits: 'Rectus abdominis strength. Core stability.',
    instructions: 'Lie on back. Engage pelvic floor on exhale. Curl up head, neck and shoulders. Return to mat on inhale.',
    precautions: 'Neck strain.' },
  { name: 'Curl Up with Oblique Twist', position: 'Supine', level: 'Intermediate',
    muscles_primary: ['obliques', 'rectus abdominis'], muscles_secondary: ['transversus abdominis'],
    benefits: 'Oblique strengthening. Rotational core stability.',
    instructions: 'Lie on back. On exhale, curl up and rotate ribcage towards one hip. Opposite knee lift can be added for progression. Alternate sides.',
    precautions: 'Neck or back pain.' },
  { name: 'Knee Lift Neutral Spine', position: 'Supine', level: 'Beginner',
    muscles_primary: ['transversus abdominis', 'hip flexors'], muscles_secondary: ['pelvic floor'],
    benefits: 'Lower abdominal activation. Neutral spine maintenance.',
    instructions: 'Lie on back in neutral spine. Check that navel is being held in. Inhale to prepare. Exhale, float one knee up to 90 degrees. Lower on inhale. Alternate.',
    precautions: 'Lower back pain.' },
  { name: 'Table Top Legs Spine Imprint', position: 'Supine', level: 'Intermediate',
    muscles_primary: ['transversus abdominis', 'rectus abdominis'], muscles_secondary: ['hip flexors'],
    benefits: 'Lower abdominal control. Lumbar stabilisation.',
    instructions: 'Lie on back with spine imprinted (gentle lumbar flexion). Bring legs to table top position. Maintain imprint as you work.',
    precautions: 'Lower back pain.' },
  { name: 'Single Leg Stretch Imprint', position: 'Supine', level: 'Intermediate',
    muscles_primary: ['rectus abdominis', 'transversus abdominis'], muscles_secondary: ['hip flexors'],
    benefits: 'Lower abdominal strength. Hip flexor control.',
    instructions: 'In spine imprint. Bring both knees to table top. Extend one leg while other remains bent. Alternate. Keep lower back connected to mat throughout.',
    precautions: 'Lower back pain.' },
  { name: 'Single Leg Shoulder Bridge', position: 'Supine', level: 'Advanced',
    muscles_primary: ['glutes', 'hamstrings'], muscles_secondary: ['transversus abdominis', 'erector spinae'],
    benefits: 'Unilateral glute and hamstring strength. Pelvic stability.',
    instructions: 'In bridge position, extend one leg. Maintain level pelvis. Lower and lift extended leg, or hold and work the opposite leg.',
    precautions: 'Knee or hip pain.' },
  { name: 'Side Bridge Both Knees Bent', position: 'Side-lying', level: 'Beginner',
    muscles_primary: ['obliques', 'hip abductors'], muscles_secondary: ['shoulders', 'transversus abdominis'],
    benefits: 'Lateral core strength. Shoulder stabilisation.',
    instructions: 'Lie on side. Both knees bent. Lift hips to create straight line from knees to shoulders. Hold. Lower with control.',
    precautions: 'Shoulder injury.' },
  { name: 'Side Bridge Both Legs Straight', position: 'Side-lying', level: 'Advanced',
    muscles_primary: ['obliques', 'hip abductors', 'transversus abdominis'], muscles_secondary: ['shoulders'],
    benefits: 'Full lateral chain strength.',
    instructions: 'Full side bridge: both legs straight, supported on one foot and one hand or forearm. Maintain body alignment.',
    precautions: 'Shoulder injury.' },
  { name: 'All Fours Quadruped', position: 'Kneeling (quadruped)', level: 'Beginner',
    muscles_primary: ['transversus abdominis'], muscles_secondary: ['erector spinae', 'shoulders'],
    benefits: 'Core stability. Spinal neutral. Foundation for plank progression.',
    instructions: 'On hands and knees, wrists under shoulders, knees under hips. Engage core. Can lift knees slightly or lift opposite arm and leg.',
    precautions: 'Wrist or knee pain.' },
  { name: 'High Plank', position: 'Prone (plank)', level: 'Intermediate',
    muscles_primary: ['transversus abdominis', 'rectus abdominis'], muscles_secondary: ['shoulders', 'glutes', 'quadriceps'],
    benefits: 'Full body core strength. Shoulder stability.',
    instructions: 'Full push up position: hands under shoulders, body straight from head to heels. Engage abs and glutes. Hold.',
    precautions: 'Shoulder or wrist injury.' },
  { name: 'Forearm Plank', position: 'Prone (plank)', level: 'Intermediate',
    muscles_primary: ['transversus abdominis', 'rectus abdominis'], muscles_secondary: ['erector spinae', 'glutes'],
    benefits: 'Core endurance. Reduced shoulder load vs high plank.',
    instructions: 'Forearms on mat, elbows under shoulders. Body straight from head to heels. Hold with core engaged.',
    precautions: 'Shoulder or elbow injury.' },
  { name: 'Plank with Leg Lift', position: 'Prone (plank)', level: 'Advanced',
    muscles_primary: ['transversus abdominis', 'glutes'], muscles_secondary: ['erector spinae', 'hamstrings'],
    benefits: 'Core and glute strength. Whole-body stability.',
    instructions: 'In full plank. Lift one leg with control. Maintain hip level and core engagement.',
    precautions: 'Shoulder or lower back pain.' },
  { name: 'Side Lying Open Door', position: 'Side-lying', level: 'Beginner',
    muscles_primary: ['thoracic rotators'], muscles_secondary: ['pectorals', 'rhomboids'],
    benefits: 'Thoracic rotation. Chest and shoulder opening.',
    instructions: 'Lie on side with hips and knees at 90 degrees. Top arm extended forward. Rotate upper body, sweeping top arm over and behind as if opening a door. Follow hand with gaze. Return.',
    precautions: 'Shoulder injury.' },
  { name: 'Dart Prone', position: 'Prone', level: 'Intermediate',
    muscles_primary: ['erector spinae', 'rhomboids'], muscles_secondary: ['glutes', 'transversus abdominis'],
    benefits: 'Back extensor strength. Shoulder stabilisation.',
    instructions: 'Lie on stomach, arms by sides. Engage core. Lift head, chest and arms simultaneously, keeping arms long by the sides. Lower with control.',
    precautions: 'Lower back or neck injury.' },
  { name: 'Opposite Arm Leg Lift Prone', position: 'Prone', level: 'Intermediate',
    muscles_primary: ['erector spinae', 'glutes'], muscles_secondary: ['hamstrings', 'shoulders'],
    benefits: 'Contra-lateral coordination. Back extensor and glute strength.',
    instructions: 'Lie on stomach, arms straight overhead. Lift opposite arm and leg simultaneously. Arms/legs straight, hips in contact with floor. Alternate.',
    precautions: 'Lower back pain.' },
  { name: 'Supine Hip Extension Swiss Ball', position: 'Supine', level: 'Intermediate',
    muscles_primary: ['glutes', 'hamstrings'], muscles_secondary: ['erector spinae', 'transversus abdominis'],
    benefits: 'Glute and hamstring strength. Posterior chain activation.',
    instructions: 'Lie on back, feet on Swiss ball. Lift hips into bridge. Lower with control. Progress to single leg.',
    precautions: 'Ensure ball is correctly inflated.' },
  { name: 'SHELC Swiss Ball', position: 'Supine', level: 'Advanced',
    muscles_primary: ['hamstrings', 'glutes'], muscles_secondary: ['transversus abdominis', 'erector spinae'],
    benefits: 'Hamstring and glute strength. Core stability.',
    instructions: 'Lie on back, feet on Swiss ball. Lift hips into bridge. Roll ball towards hips by bending knees. Extend back out. Keep hips elevated throughout.',
    precautions: 'Knee or lower back pain.' },
  { name: 'Jack Knife Swiss Ball', position: 'Prone (on ball)', level: 'Advanced',
    muscles_primary: ['transversus abdominis', 'hip flexors'], muscles_secondary: ['rectus abdominis', 'shoulders'],
    benefits: 'Dynamic core strength and stability.',
    instructions: 'Plank with feet on Swiss ball. Roll ball towards chest by drawing knees in. Extend back out.',
    precautions: 'Shoulder or wrist injury.' },
];

async function seed() {
  console.log(`\n🧘 Seeding ${EXERCISES.length} Pilates exercises...\n`);
  let ok = 0, fail = 0;

  for (const ex of EXERCISES) {
    const { description_start, description_move, description_avoid } =
      splitInstructions(ex.instructions, ex.precautions);

    const record = {
      name: ex.name,
      category: 'pilates',
      description_start,
      description_move,
      description_avoid,
      gif_url: null,
      muscles_primary: ex.muscles_primary || [],
      muscles_secondary: ex.muscles_secondary || [],
      experience_level: mapLevel(ex.level),
      source: 'custom',
      exercisedb_id: null,
      movement_pattern: positionToMovementPattern(ex.position, ex.name),
      equipment: 'bodyweight',
      chain_type: 'closed',
    };

    const { error } = await supabase
      .from('exercises')
      .upsert(record, { onConflict: 'name,category' });

    if (error) {
      console.error(`  ❌  ${ex.name}: ${error.message}`);
      fail++;
    } else {
      console.log(`  ✅  ${ex.name}`);
      ok++;
    }
  }

  console.log(`\n─────────────────────────────`);
  console.log(`  Seeded: ${ok}   Errors: ${fail}`);
  console.log(`─────────────────────────────\n`);

  if (fail > 0) {
    console.log('⚠️  Errors above likely mean:');
    console.log('   1. The SQL migration in Step 2 was not run yet, OR');
    console.log('   2. The (name, category) unique constraint does not exist.');
    console.log('   → Run the SQL in Step 2, then try again.\n');
  }
}

seed().catch(console.error);
