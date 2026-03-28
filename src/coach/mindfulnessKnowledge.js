// mindfulnessKnowledge.js
// Complete mindfulness library for Fitz — scripts, signals, benefits, coaching rules
// Injected selectively into Fitz's context based on conversation signals

export const MINDFULNESS_PRACTICES = {

  body_scan: {
    name: 'Body Scan',
    duration_mins: 7,
    best_for: ['poor sleep', 'post exercise', 'body disconnection', 'high stress', 'first practice'],
    brief_description: 'A gentle practice of moving attention slowly through the body, noticing sensation without trying to change anything. Done lying down or seated. Ideal as a first mindfulness practice — concrete and grounded.',
    script: `Before we start, just know that there is no right way to do this. If you find your mind drifting off — which it will, that is completely normal — just notice it and gently come back. You do not need to do anything perfectly here. Just notice.\n\nFind a comfortable position, either lying down or sitting with your back supported. Let your eyes close, or soften your gaze toward the floor.\n\nTake one slow breath in... and let it go.\n\nBring your attention to your feet. Not trying to change anything — just noticing. What do you feel there? Temperature? Pressure against the floor or bed? Maybe nothing at all — that is fine too.\n\nSlowly move your attention up through your lower legs... your knees... your thighs. Noticing any tension, any warmth, any heaviness or lightness.\n\nBring your attention to your hips and lower back. This is often where we carry a lot. See if you can just observe what is there, without needing to fix it.\n\nMoving up through your abdomen... your chest. Notice the gentle rise and fall as you breathe.\n\nYour shoulders. Your arms. Right down to your fingertips. Let them be heavy.\n\nYour neck... your jaw. Most of us hold a surprising amount of tension in the jaw. See if you can let it soften slightly, even just a little.\n\nYour eyes, your forehead... the top of your head.\n\nNow take a moment to hold your whole body in awareness at once. You do not need to do anything with what you have noticed. Just rest here.\n\nWhen you are ready, take a slightly deeper breath and begin to gently bring your attention back to the room. Wiggle your fingers and toes. And whenever you are ready, open your eyes.\n\nThat is it. Well done.`,
    audio_url: 'https://jqxhmmmvlrrsbrofssce.supabase.co/storage/v1/object/public/mindfulness-audio/Body_Scan.mp3',
  },

  breath_focus: {
    name: 'Breath Focus',
    duration_mins: 3,
    best_for: ['anxiety', 'pre-session nerves', 'daily reset', 'busy mind', 'quick practice'],
    brief_description: 'Three minutes of placing attention on the sensations of breathing. The mind wanders — that is the practice, not a failure. Works anywhere, any time.',
    script: `Get comfortable — sitting or standing is fine. Let your eyes close if that feels okay, or just let your gaze soften.\n\nWe are going to take three minutes to just be here.\n\nStart by noticing your breath — not changing it, just noticing it. Feel where you feel it most clearly. Maybe in your chest, your belly, or the air moving at your nose.\n\nEach time you breathe in, you might silently say to yourself: in. Each time you breathe out: out. Or just notice the sensation without words. Either works.\n\nYour mind will wander. That is not a failure — it is what minds do. The practice is simply the noticing. When you realise you have drifted, you come back. No frustration needed — just back.\n\nKeep going, one breath at a time.\n\nBegin to let go of any effort. Just rest with the breath for a few more moments.\n\nAnd when you are ready, gently come back to the room.`
  },

  grounding: {
    name: 'Grounding (5-4-3-2-1)',
    duration_mins: 3,
    best_for: ['acute stress', 'overwhelm', 'anxiety right now', 'pre-session nerves', 'immediate reset'],
    brief_description: 'A sensory grounding technique that anchors attention in present-moment experience. Works immediately, anywhere, with eyes open. Most useful when stress or anxiety is active right now.',
    script: `This is a simple grounding technique — it takes about three minutes and works anywhere. You can keep your eyes open for this one.\n\nStart by taking one slow breath in and letting it go.\n\nNow look around you and find five things you can see. Take your time — really look at them. A colour, a shape, something you might not normally notice.\n\nNow notice four things you can physically feel. The weight of your body in the chair. The temperature of the air on your skin. Your feet on the floor.\n\nNow listen for three things you can hear. Maybe something close by, maybe something in the distance.\n\nTwo things you can smell. Even if you cannot smell anything obvious, pay attention to the air.\n\nAnd one thing you can taste — even just the subtle taste in your mouth right now.\n\nTake one more slow breath.\n\nYou are here. You are okay.`
  },

  mindful_walking: {
    name: 'Mindful Walk',
    duration_mins: 10,
    best_for: ['restlessness', 'transition stress', 'cannot sit still', 'lunchtime reset', 'active users'],
    brief_description: 'Walking with deliberate attention to the physical experience — feet, breath, surroundings. No special route needed. Combines physical movement with mental reset.',
    script: `This works best for a simple route — somewhere you can walk without needing to navigate. It could be around a block, through a park, or even up and down a street.\n\nBefore you start walking, just stand still for a moment. Notice your feet on the ground. Feel the weight of your body.\n\nBegin walking at a natural pace — not slower than normal, just more attentive.\n\nBring your attention to your feet. The sensation of each foot lifting... moving forward... meeting the ground again. The rhythm of it.\n\nNow widen your attention to include your whole body as it moves. The swing of your arms. Your breath. Any tension or ease in your shoulders.\n\nNow expand outward to what is around you. What do you see? What do you hear? Is there a breeze? What temperature is the air?\n\nYou are not trying to appreciate it or think about it — just receive it. Notice, then let it go, then notice the next thing.\n\nWhen your mind drifts to plans, problems, or stories — and it will — just notice and bring yourself back to the sensation of walking.\n\nStay with this for the rest of your walk.`
  },

  nature_observation: {
    name: 'Nature Pause',
    duration_mins: 2,
    best_for: ['sceptics', 'very busy users', 'micro reset', 'post-stress', 'first practice for resistant users'],
    brief_description: 'Two minutes of sustained attention on something in the natural environment. Requires no special position, no prior experience. The lowest-barrier entry point to mindfulness.',
    script: `Find something in nature to look at — a tree, the sky, a plant, light on the ground. It does not have to be beautiful or remarkable.\n\nSet a timer for two minutes.\n\nJust look at it. Really look. Notice its colour — not just green, but all the greens. Notice texture, movement, light and shadow.\n\nWhen you find yourself thinking about it — explaining it, comparing it, forming opinions — just come back to simply looking.\n\nYou are not trying to feel anything in particular. Just observing.\n\nStay with this until the timer goes.`
  },

  pre_sleep: {
    name: 'Pre-Sleep Relaxation',
    duration_mins: 10,
    best_for: ['poor sleep', 'high evening stress', 'cannot switch off', 'wired but tired'],
    brief_description: 'A body-based relaxation practice done in bed. Progressively releases tension from feet to head, using breath and imagery of heaviness. Supports sleep onset.',
    script: `Get comfortable in bed. Let your body settle. You do not need to do anything tonight — just let this guide you toward rest.\n\nClose your eyes. Take a slow breath in through your nose and let it out gently through your mouth. Do that twice more.\n\nImagine that with each breath out, your body gets a little heavier. A little more settled into the mattress.\n\nStarting with your feet — let them go. Feel them soften and sink. Your ankles... your calves. Heavy and warm.\n\nYour thighs... your hips... your lower back against the bed. Let the mattress hold you. You do not need to hold yourself up.\n\nYour belly softens as you breathe out... your chest... your shoulders dropping.\n\nYour hands open slightly. Your arms rest, heavy at your sides.\n\nYour jaw. Let it drop just a little. Your eyes are soft behind your lids. Your forehead smooth.\n\nYour whole body is heavy and still.\n\nJust breathe and let go. Breathe and let go.\n\nThere is nothing you need to do or think about right now. Rest.`
  },

  journaling: {
    name: 'Journaling',
    duration_mins: 10,
    best_for: [
      'emotional processing',
      'gratitude practice',
      'daily reflection',
      'stress and overwhelm',
      'goal clarity',
      'end of day wind-down'
    ],
    brief_description: 'A short writing practice — reflection, gratitude, or planning. Helps settle the mind and build self-awareness.',
    prompts: {
      reflection: [
        'What happened today that felt meaningful, even in a small way?',
        'What did you find difficult today, and what does that tell you?',
        'What is one thing you handled well today?',
        'What would you do differently if you had today again?',
        'What are you looking forward to tomorrow?'
      ],
      gratitude: [
        'Name three things that went well today, however small.',
        'Who made a positive difference to your day, and how?',
        'What do you have right now that you sometimes take for granted?',
        'What is something about your body or health you are grateful for today?',
        'What small pleasure did you experience today?'
      ],
      planning: [
        'What are the three most important things to focus on tomorrow?',
        'Is there anything unfinished from today that needs carrying forward?',
        'What might get in the way tomorrow, and how will you handle it?',
        'What would make tomorrow feel like a good day?',
        'Is there anyone you need to follow up with or reach out to?'
      ]
    },
    script: `Find somewhere comfortable and quiet. You don't need to write well — just write honestly.\n\nChoose whichever prompt feels right for where you are right now. There's no wrong answer and no one is reading this but you.\n\nWrite for as long as feels useful. Some days that's two lines. Some days it's two pages. Both are fine.\n\nWhen you're done, read back what you wrote — not to judge it, just to notice what came up.`,
    icon: '✍️',
  },
};

// SIGNAL MAP — maps conversation signals to the most appropriate practice
export const SIGNAL_MAP = [
  { signals: ['can\'t sleep', 'can\'t get to sleep', 'wake up', 'waking up', 'sleep', 'sleeping', 'exhausted', 'tired but', 'wired'], practice: 'pre_sleep', priority: 1 },
  { signals: ['anxious', 'anxiety', 'on edge', 'nervous', 'jittery', 'overwhelmed', 'panic'], practice: 'grounding', priority: 1 },
  { signals: ['stressed', 'stress', 'so much on', 'full on week', 'can\'t switch off', 'switch off', 'busy mind', 'mind racing'], practice: 'breath_focus', priority: 2 },
  { signals: ['not really feeling', 'going through the motions', 'disconnected', 'numb', 'flat'], practice: 'body_scan', priority: 2 },
  { signals: ['restless', 'can\'t sit still', 'need to move', 'fidgety'], practice: 'mindful_walking', priority: 2 },
  { signals: ['no time', 'too busy', 'don\'t have time', 'not sure about meditation', 'not a meditation person'], practice: 'nature_observation', priority: 3 },
  { signals: ['after my session', 'after training', 'just finished', 'cool down'], practice: 'body_scan', priority: 2 },
];

// COACHING LANGUAGE — how Fitz introduces practices
export const COACHING_LANGUAGE = {
  sceptic_framing: ['a short reset', 'a grounding technique', 'just paying attention for a bit', 'a breathing exercise', 'something that takes two minutes'],
  offer_phrases: [
    'There is something simple I sometimes suggest that a lot of people find helpful for that — would you be open to trying it?',
    'I have something that might help with that — it only takes a few minutes. Want to give it a go?',
    'Something that can really help with that feeling is a short grounding exercise — would that be useful right now?',
    'There is a two-minute thing I sometimes suggest for exactly that — it is not meditation, just paying a bit more attention. Interested?'
  ],
  after_script_prompts: [
    'How did that land for you?',
    'What did you notice?',
    'How are you feeling now compared to before?'
  ]
};

// BENEFITS SUMMARY — for Fitz to draw on when explaining why a practice helps
export const BENEFITS = {
  body_scan: 'Brings attention back into the body and away from mental chatter. Supports sleep quality and physical recovery.',
  breath_focus: 'Reduces the physiological stress response. Gives the nervous system a chance to settle.',
  grounding: 'Interrupts the anxiety cycle by redirecting attention to present-moment sensory experience.',
  mindful_walking: 'Combines the restorative effect of attention with physical movement. Good for restless energy.',
  nature_observation: 'Restores directed attention capacity. Even two minutes has a measurable calming effect.',
  pre_sleep: 'Reduces cortisol and muscle tension, supporting sleep onset. Particularly helpful after high-stress days.'
};
