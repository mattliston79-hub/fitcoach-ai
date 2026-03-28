import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  // Vercel cron jobs send GET requests
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Protect the endpoint — only Vercel cron or an authorised caller
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const auth = req.headers.authorization
    if (auth !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorised' })
    }
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY
  const SUPABASE_URL   = process.env.VITE_SUPABASE_URL
  const SERVICE_KEY    = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!RESEND_API_KEY || !SUPABASE_URL || !SERVICE_KEY) {
    return res.status(500).json({ error: 'Missing environment variables' })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
  const today = new Date().toISOString().slice(0, 10)

  // Find all weekly_review sessions planned for today, not yet reminded
  const { data: sessions, error: fetchErr } = await supabase
    .from('sessions_planned')
    .select(`
      id,
      user_id,
      date,
      users!inner (
        name,
        email
      )
    `)
    .eq('practice_type', 'weekly_review')
    .eq('status', 'planned')
    .eq('date', today)
    .eq('reminder_sent', false)

  if (fetchErr) {
    console.error('[send-weekly-reminders] fetch error:', fetchErr)
    return res.status(500).json({ error: fetchErr.message })
  }

  if (!sessions || sessions.length === 0) {
    return res.status(200).json({ sent: 0, message: 'No reminders due today' })
  }

  const results = []

  for (const session of sessions) {
    const userName  = session.users?.name?.split(' ')[0] || 'there'
    const userEmail = session.users?.email

    if (!userEmail) {
      results.push({ id: session.id, status: 'skipped — no email' })
      continue
    }

    const appUrl = 'https://alongside.fit/chat/fitz'

    const emailBody = {
      from: 'Fitz at Alongside <noreply@alongside.fit>',
      to:   [userEmail],
      subject: `Your weekly check-in is today, ${userName}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                    max-width: 480px; margin: 0 auto; padding: 32px 24px;
                    background: #ffffff;">

          <div style="text-align: center; margin-bottom: 28px;">
            <div style="width: 48px; height: 48px; border-radius: 50%;
                        background: #0e9e75; margin: 0 auto 12px;
                        display: flex; align-items: center; justify-content: center;
                        font-size: 20px; font-weight: 700; color: #ffffff;
                        line-height: 48px; text-align: center;">F</div>
            <p style="margin: 0; font-size: 13px; color: #9ca3af;
                      letter-spacing: 0.05em; text-transform: uppercase;">
              Alongside
            </p>
          </div>

          <h1 style="font-size: 22px; font-weight: 600; color: #1f2937;
                     margin: 0 0 16px; line-height: 1.3;">
            Hi ${userName} — your weekly check-in is today
          </h1>

          <p style="font-size: 15px; color: #4b5563; line-height: 1.7; margin: 0 0 16px;">
            You scheduled a weekly check-in with me for today. It only takes about
            15 minutes, and it's a chance to reflect on how the week has gone —
            physically, emotionally, how the training has felt — and think about
            what you want from the week ahead.
          </p>

          <p style="font-size: 15px; color: #4b5563; line-height: 1.7; margin: 0 0 28px;">
            No agenda, no pressure. Just an honest conversation when you're ready.
          </p>

          <div style="text-align: center; margin: 0 0 28px;">
            <a href="${appUrl}"
               style="display: inline-block; background: #0e9e75; color: #ffffff;
                      font-size: 15px; font-weight: 600; padding: 14px 32px;
                      border-radius: 12px; text-decoration: none;">
              Start my check-in →
            </a>
          </div>

          <p style="font-size: 13px; color: #9ca3af; line-height: 1.6; margin: 0 0 4px;">
            If now isn't the right time, your check-in will still be there whenever
            you're ready. You can find it in the Wellbeing tab under Mindfulness.
          </p>

          <hr style="border: none; border-top: 1px solid #f3f4f6; margin: 24px 0;" />

          <p style="font-size: 12px; color: #d1d5db; line-height: 1.5; margin: 0;">
            You're receiving this because you scheduled a weekly check-in in Alongside.
            To change your schedule, open the app and edit your planner.
          </p>

        </div>
      `,
    }

    try {
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify(emailBody),
      })

      if (!emailRes.ok) {
        const err = await emailRes.text()
        console.error(`[send-weekly-reminders] Resend error for ${userEmail}:`, err)
        results.push({ id: session.id, status: 'email_failed', email: userEmail })
        continue
      }

      // Mark reminder_sent so we never send again for this session
      const { error: updateErr } = await supabase
        .from('sessions_planned')
        .update({ reminder_sent: true })
        .eq('id', session.id)

      if (updateErr) {
        console.error(`[send-weekly-reminders] update error:`, updateErr)
      }

      results.push({ id: session.id, status: 'sent', email: userEmail })

    } catch (err) {
      console.error(`[send-weekly-reminders] error for session ${session.id}:`, err)
      results.push({ id: session.id, status: 'error', message: err.message })
    }
  }

  const sent = results.filter(r => r.status === 'sent').length
  console.log(`[send-weekly-reminders] done — ${sent}/${sessions.length} reminders sent`)

  return res.status(200).json({ sent, total: sessions.length, results })
}
