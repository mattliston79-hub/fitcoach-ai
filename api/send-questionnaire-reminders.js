import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
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
  const now = new Date().toISOString()

  // Find users whose questionnaire is due and not snoozed
  const { data: schedules, error: fetchErr } = await supabase
    .from('questionnaire_schedule')
    .select(`
      user_id,
      next_due_at,
      reminder_dismissed_until,
      users!inner (
        name,
        email
      )
    `)
    .lt('next_due_at', now)

  if (fetchErr) {
    console.error('[send-questionnaire-reminders] fetch error:', fetchErr)
    return res.status(500).json({ error: fetchErr.message })
  }

  // Also fetch users who have never completed (no schedule row) — skip for cron, handled by UI
  if (!schedules || schedules.length === 0) {
    return res.status(200).json({ sent: 0, message: 'No reminders due' })
  }

  const results = []
  const appUrl  = 'https://alongside.fit/my-data'

  for (const sched of schedules) {
    // Skip if snoozed
    if (sched.reminder_dismissed_until && new Date(sched.reminder_dismissed_until) > new Date()) {
      results.push({ userId: sched.user_id, status: 'snoozed' })
      continue
    }

    const userName  = sched.users?.name?.split(' ')[0] || 'there'
    const userEmail = sched.users?.email

    if (!userEmail) {
      results.push({ userId: sched.user_id, status: 'skipped — no email' })
      continue
    }

    const emailBody = {
      from: 'Fitz at Alongside <noreply@alongside.fit>',
      to:   [userEmail],
      subject: `Your 4-week wellbeing check-in is due, ${userName}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                    max-width: 480px; margin: 0 auto; padding: 32px 24px;
                    background: #ffffff;">

          <div style="text-align: center; margin-bottom: 28px;">
            <div style="width: 48px; height: 48px; border-radius: 50%;
                        background: #0e9e75; margin: 0 auto 12px;
                        line-height: 48px; text-align: center;
                        font-size: 20px; font-weight: 700; color: #ffffff;">F</div>
            <p style="margin: 0; font-size: 13px; color: #9ca3af;
                      letter-spacing: 0.05em; text-transform: uppercase;">
              Alongside
            </p>
          </div>

          <h1 style="font-size: 22px; font-weight: 600; color: #1f2937;
                     margin: 0 0 16px; line-height: 1.3;">
            Hi ${userName} — your wellbeing check-in is due
          </h1>

          <p style="font-size: 15px; color: #4b5563; line-height: 1.7; margin: 0 0 16px;">
            It's been about four weeks since you last completed your PERMA and physical activity
            check-in. It only takes 5–10 minutes, and it gives me a much clearer picture of how
            you're really doing — not just the training side, but all of it.
          </p>

          <p style="font-size: 15px; color: #4b5563; line-height: 1.7; margin: 0 0 28px;">
            No pressure — but the more I know, the better I can support you.
          </p>

          <div style="text-align: center; margin: 0 0 28px;">
            <a href="${appUrl}"
               style="display: inline-block; background: #0e9e75; color: #ffffff;
                      font-size: 15px; font-weight: 600; padding: 14px 32px;
                      border-radius: 12px; text-decoration: none;">
              Start my check-in →
            </a>
          </div>

          <hr style="border: none; border-top: 1px solid #f3f4f6; margin: 24px 0;" />

          <p style="font-size: 12px; color: #d1d5db; line-height: 1.5; margin: 0;">
            You're receiving this because you're an Alongside member.
            You can find your check-in under My Data in the app.
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
        console.error(`[send-questionnaire-reminders] Resend error for ${userEmail}:`, err)
        results.push({ userId: sched.user_id, status: 'email_failed' })
        continue
      }

      results.push({ userId: sched.user_id, status: 'sent', email: userEmail })
    } catch (err) {
      console.error(`[send-questionnaire-reminders] error:`, err)
      results.push({ userId: sched.user_id, status: 'error', message: err.message })
    }
  }

  const sent = results.filter(r => r.status === 'sent').length
  console.log(`[send-questionnaire-reminders] done — ${sent}/${schedules.length} reminders sent`)

  return res.status(200).json({ sent, total: schedules.length, results })
}
