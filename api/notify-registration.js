export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { name, email, age, gender, activityConfidence, countryCode } = req.body

  if (!email) {
    return res.status(400).json({ error: 'Missing email' })
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY
  if (!RESEND_API_KEY) {
    console.error('RESEND_API_KEY not set')
    return res.status(500).json({ error: 'Email service not configured' })
  }

  const confidenceLabels = {
    very_low:  'Not at all confident',
    low:       'A little nervous',
    moderate:  'Fairly confident',
    high:      'Confident',
  }

  const body = {
    from:    'Alongside <noreply@alongside.fit>',
    to:      ['hello@alongside.fit'],
    subject: `New registration request — ${name || email}`,
    html: `
      <h2>New Alongside Registration Request</h2>
      <table style="border-collapse:collapse;width:100%;font-family:sans-serif;font-size:14px">
        <tr><td style="padding:8px;border:1px solid #eee;font-weight:600">Name</td>
            <td style="padding:8px;border:1px solid #eee">${name || '—'}</td></tr>
        <tr><td style="padding:8px;border:1px solid #eee;font-weight:600">Email</td>
            <td style="padding:8px;border:1px solid #eee">${email}</td></tr>
        <tr><td style="padding:8px;border:1px solid #eee;font-weight:600">Age</td>
            <td style="padding:8px;border:1px solid #eee">${age || '—'}</td></tr>
        <tr><td style="padding:8px;border:1px solid #eee;font-weight:600">Gender</td>
            <td style="padding:8px;border:1px solid #eee">${gender || '—'}</td></tr>
        <tr><td style="padding:8px;border:1px solid #eee;font-weight:600">Activity confidence</td>
            <td style="padding:8px;border:1px solid #eee">${confidenceLabels[activityConfidence] || activityConfidence || '—'}</td></tr>
        <tr><td style="padding:8px;border:1px solid #eee;font-weight:600">Country</td>
            <td style="padding:8px;border:1px solid #eee">${countryCode || '—'}</td></tr>
        <tr><td style="padding:8px;border:1px solid #eee;font-weight:600">Disclaimer confirmed</td>
            <td style="padding:8px;border:1px solid #eee">✓ Yes — all four declarations ticked</td></tr>
      </table>
      <p style="margin-top:16px;font-family:sans-serif;font-size:13px;color:#666">
        To approve this user, log into Supabase → Authentication → Users,
        find <strong>${email}</strong>, and confirm their email manually.
        Then email them at ${email} to let them know access has been approved.
      </p>
    `,
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('Resend error:', err)
      return res.status(500).json({ error: 'Failed to send notification email' })
    }

    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('notify-registration error:', err)
    return res.status(500).json({ error: err.message })
  }
}
