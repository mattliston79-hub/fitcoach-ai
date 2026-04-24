export async function addLifestyleSession({
  userId,
  title,
  date,
  duration_mins,
  purpose_note,
  session_type = 'lifestyle_cardio',
  goal_id = null,
  notes = null,
  supabase
}) {
  const newSession = {
    user_id: userId,
    session_type,
    title,
    date,
    duration_mins: parseInt(duration_mins) || null,
    purpose_note,
    goal_id,
    notes,
    source: 'fitz',
    status: 'planned'
  }
  
  const { data, error } = await supabase
    .from('sessions_planned')
    .insert(newSession)
    .select()
    .single()

  if (error) {
    throw error
  }
  
  return data
}
