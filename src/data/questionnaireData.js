// src/data/questionnaireData.js
// PERMA Profiler + IPAQ Short Form question definitions and scoring logic

// ---------------------------------------------------------------------------
// PERMA PROFILER
// 23 items. Source: Butler & Kern (2016), University of Pennsylvania.
// Used under non-commercial research licence pending commercial agreement.
// ---------------------------------------------------------------------------

export const PERMA_BLOCKS = [
  {
    id: 'block1',
    instruction: 'In general...',
    scale: { min: 0, max: 10, lowLabel: 'Never', highLabel: 'Always' },
    questions: [
      { id: 'A1', domain: 'A', text: 'How much of the time do you feel you are making progress towards accomplishing your goals?' },
      { id: 'E1', domain: 'E', text: 'How often do you become absorbed in what you are doing?' },
      { id: 'P1', domain: 'P', text: 'In general, how often do you feel joyful?' },
      { id: 'N1', domain: 'N', text: 'In general, how often do you feel anxious?' },
      { id: 'A2', domain: 'A', text: 'How often do you achieve the important goals you have set for yourself?' },
    ],
  },
  {
    id: 'block2',
    instruction: 'In general...',
    scale: { min: 0, max: 10, lowLabel: 'Terrible', highLabel: 'Excellent' },
    questions: [
      { id: 'H1', domain: 'H', text: 'In general, how would you say your health is?' },
    ],
  },
  {
    id: 'block3',
    instruction: 'In general...',
    scale: { min: 0, max: 10, lowLabel: 'Not at all', highLabel: 'Completely' },
    questions: [
      { id: 'M1', domain: 'M', text: 'In general, to what extent do you lead a purposeful and meaningful life?' },
      { id: 'R1', domain: 'R', text: 'To what extent do you receive help and support from others when you need it?' },
      { id: 'M2', domain: 'M', text: 'In general, to what extent do you feel that what you do in your life is valuable and worthwhile?' },
      { id: 'E2', domain: 'E', text: 'In general, to what extent do you feel excited and interested in things?' },
      { id: 'Lon', domain: 'Lon', text: 'How lonely do you feel in your daily life?' },
    ],
  },
  {
    id: 'block4',
    instruction: '',
    scale: { min: 0, max: 10, lowLabel: 'Not at all', highLabel: 'Completely' },
    questions: [
      { id: 'H2', domain: 'H', text: 'How satisfied are you with your current physical health?' },
    ],
  },
  {
    id: 'block5',
    instruction: 'In general...',
    scale: { min: 0, max: 10, lowLabel: 'Never', highLabel: 'Always' },
    questions: [
      { id: 'P2', domain: 'P', text: 'In general, how often do you feel positive?' },
      { id: 'N2', domain: 'N', text: 'In general, how often do you feel angry?' },
      { id: 'A3', domain: 'A', text: 'How often are you able to handle your responsibilities?' },
      { id: 'N3', domain: 'N', text: 'In general, how often do you feel sad?' },
      { id: 'E3', domain: 'E', text: 'How often do you lose track of time while doing something you enjoy?' },
    ],
  },
  {
    id: 'block6',
    instruction: '',
    scale: { min: 0, max: 10, lowLabel: 'Terrible', highLabel: 'Excellent' },
    questions: [
      { id: 'H3', domain: 'H', text: 'Compared to others of your same age and sex, how is your health?' },
    ],
  },
  {
    id: 'block7',
    instruction: 'In general...',
    scale: { min: 0, max: 10, lowLabel: 'Not at all', highLabel: 'Completely' },
    questions: [
      { id: 'R2', domain: 'R', text: 'To what extent do you feel loved?' },
      { id: 'M3', domain: 'M', text: 'To what extent do you generally feel you have a sense of direction in your life?' },
      { id: 'R3', domain: 'R', text: 'How satisfied are you with your personal relationships?' },
      { id: 'P3', domain: 'P', text: 'In general, to what extent do you feel contented?' },
    ],
  },
  {
    id: 'block8',
    instruction: '',
    scale: { min: 0, max: 10, lowLabel: 'Not at all', highLabel: 'Completely' },
    questions: [
      { id: 'hap', domain: 'hap', text: 'Taking all things together, how happy would you say you are?' },
    ],
  },
];

// All PERMA question IDs in order (for building responses_json)
export const PERMA_ALL_IDS = PERMA_BLOCKS.flatMap(b => b.questions.map(q => q.id));

// Scoring function — returns an object with scores for each domain
export function scorePerma(responses) {
  const mean = (...ids) => {
    const vals = ids.map(id => responses[id]).filter(v => v !== undefined && v !== null);
    if (vals.length === 0) return null;
    return parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2));
  };
  return {
    P: mean('P1', 'P2', 'P3'),
    E: mean('E1', 'E2', 'E3'),
    R: mean('R1', 'R2', 'R3'),
    M: mean('M1', 'M2', 'M3'),
    A: mean('A1', 'A2', 'A3'),
    N: mean('N1', 'N2', 'N3'),
    H: mean('H1', 'H2', 'H3'),
    Lon: responses['Lon'] ?? null,
    hap: responses['hap'] ?? null,
    overall: mean('P1','P2','P3','E1','E2','E3','R1','R2','R3','M1','M2','M3','A1','A2','A3','hap'),
  };
}

// Domain labels for display
export const PERMA_DOMAIN_LABELS = {
  P: 'Positive Emotion',
  E: 'Engagement',
  R: 'Relationships',
  M: 'Meaning',
  A: 'Accomplishment',
  N: 'Negative Emotion',
  H: 'Health',
  Lon: 'Loneliness',
  hap: 'Happiness',
  overall: 'Overall Wellbeing',
};

// ---------------------------------------------------------------------------
// IPAQ SHORT FORM
// 9 questions covering vigorous activity, moderate activity, walking, sitting,
// and sport in the last 7 days.
// Public domain instrument. Source: Craig et al. (2003).
// ---------------------------------------------------------------------------

export const IPAQ_QUESTIONS = [
  {
    id: 'Q1',
    section: 'vigorous',
    type: 'days',
    text: 'During the last 7 days, on how many days did you do vigorous physical activities like heavy lifting, digging, aerobics, or fast bicycling?',
    skipIfZero: 'Q2',
    placeholder: 'Days per week (0–7)',
  },
  {
    id: 'Q2',
    section: 'vigorous',
    type: 'duration',
    text: 'How much time did you usually spend doing vigorous physical activities on one of those days?',
    hoursId: 'Q2_hours',
    minsId: 'Q2_mins',
    dependsOn: 'Q1',
  },
  {
    id: 'Q3',
    section: 'moderate',
    type: 'days',
    text: 'During the last 7 days, on how many days did you do moderate physical activities like carrying light loads, bicycling at a regular pace, or doubles tennis? Do not include walking.',
    skipIfZero: 'Q4',
    placeholder: 'Days per week (0–7)',
  },
  {
    id: 'Q4',
    section: 'moderate',
    type: 'duration',
    text: 'How much time did you usually spend doing moderate physical activities on one of those days?',
    hoursId: 'Q4_hours',
    minsId: 'Q4_mins',
    dependsOn: 'Q3',
  },
  {
    id: 'Q5',
    section: 'walking',
    type: 'days',
    text: 'During the last 7 days, on how many days did you walk for at least 10 minutes at a time?',
    skipIfZero: 'Q6',
    placeholder: 'Days per week (0–7)',
  },
  {
    id: 'Q6',
    section: 'walking',
    type: 'duration',
    text: 'How much time did you usually spend walking on one of those days?',
    hoursId: 'Q6_hours',
    minsId: 'Q6_mins',
    dependsOn: 'Q5',
  },
  {
    id: 'Q7',
    section: 'sitting',
    type: 'duration',
    text: 'During the last 7 days, how much time did you spend sitting on a week day?',
    hoursId: 'Q7_hours',
    minsId: 'Q7_mins',
  },
  {
    id: 'Q8',
    section: 'sport',
    type: 'days',
    text: 'During the last 7 days, on how many days did you take part in any sport or deliberate exercise (e.g. running, jogging)?',
    skipIfZero: 'Q9',
    placeholder: 'Days per week (0–7)',
  },
  {
    id: 'Q9',
    section: 'sport',
    type: 'duration',
    text: 'How much time did you usually spend doing sport on one of those days?',
    hoursId: 'Q9_hours',
    minsId: 'Q9_mins',
    dependsOn: 'Q8',
  },
];

// IPAQ scoring: calculate MET-minutes per week for each domain
// MET values: vigorous = 8.0, moderate = 4.0, walking = 3.3
export function scoreIpaq(responses) {
  const toMins = (hours, mins) => (parseFloat(hours || 0) * 60) + parseFloat(mins || 0);

  const vigDays = parseFloat(responses['Q1'] || 0);
  const vigMins = toMins(responses['Q2_hours'], responses['Q2_mins']);
  const vigMET = vigDays * vigMins * 8.0;

  const modDays = parseFloat(responses['Q3'] || 0);
  const modMins = toMins(responses['Q4_hours'], responses['Q4_mins']);
  const modMET = modDays * modMins * 4.0;

  const walkDays = parseFloat(responses['Q5'] || 0);
  const walkMins = toMins(responses['Q6_hours'], responses['Q6_mins']);
  const walkMET = walkDays * walkMins * 3.3;

  const sittingMins = toMins(responses['Q7_hours'], responses['Q7_mins']);

  const sportDays = parseFloat(responses['Q8'] || 0);
  const sportMins = toMins(responses['Q9_hours'], responses['Q9_mins']);

  const totalMETMins = vigMET + modMET + walkMET;

  // Weekly moderate-equivalent minutes (for UK CMO comparison)
  // Vigorous counts double vs moderate
  const moderateEquivMins = (vigDays * vigMins * 2) + (modDays * modMins) + (walkDays * walkMins);

  // Activity level classification (IPAQ standard)
  let activityLevel = 'low';
  if (totalMETMins >= 3000 || (vigDays >= 3 && vigMins >= 20) || (modDays + walkDays >= 5 && (modMins + walkMins) >= 30)) {
    activityLevel = 'high';
  } else if (totalMETMins >= 600) {
    activityLevel = 'moderate';
  }

  return {
    vigorous_met_mins: Math.round(vigMET),
    moderate_met_mins: Math.round(modMET),
    walking_met_mins: Math.round(walkMET),
    total_met_mins: Math.round(totalMETMins),
    sitting_mins_per_day: Math.round(sittingMins),
    sport_days: sportDays,
    sport_mins_per_session: sportMins,
    moderate_equiv_mins_per_week: Math.round(moderateEquivMins),
    activity_level: activityLevel,
  };
}
