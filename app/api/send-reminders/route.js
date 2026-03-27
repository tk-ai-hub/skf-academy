import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)
const resend = new Resend(process.env.RESEND_API_KEY)

export async function GET(request) {
  // Verify cron secret to prevent unauthorized calls
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const results = []

  // Find bookings in ~24hrs and ~2hrs windows (±15 min tolerance)
  const windows = [
    { hours: 24, label: '24h', prefKey: 'notification_24h' },
    { hours: 2, label: '2h', prefKey: 'notification_2h' },
  ]

  for (const window of windows) {
    const targetTime = new Date(now.getTime() + window.hours * 60 * 60 * 1000)
    const from = new Date(targetTime.getTime() - 15 * 60 * 1000).toISOString()
    const to = new Date(targetTime.getTime() + 15 * 60 * 1000).toISOString()

    // Get bookings in this window
    const { data: bookings } = await supabase
      .from('bookings')
      .select(`
        id, student_id,
        slots!bookings_slot_id_fkey (slot_date, start_hour),
        users!bookings_student_id_fkey (
          email, first_name, notification_email, notification_24h, notification_2h
        )
      `)
      .eq('status', 'confirmed')

    if (!bookings) continue

    for (const booking of bookings) {
      const slot = booking.slots
      const user = booking.users
      if (!slot || !user) continue

      // Check if this booking falls in the window
      const lessonTime = new Date(`${slot.slot_date}T${String(slot.start_hour).padStart(2, '0')}:00:00`)
      if (lessonTime < new Date(from) || lessonTime > new Date(to)) continue

      // Check user prefs
      if (!user.notification_email) continue
      if (!user[window.prefKey]) continue

      const hour = slot.start_hour
      const timeStr = hour < 12 ? `${hour}:00 AM` : hour === 12 ? '12:00 PM' : `${hour - 12}:00 PM`
      const dateStr = new Date(slot.slot_date + 'T00:00:00').toLocaleDateString('en-CA', {
        weekday: 'long', month: 'long', day: 'numeric'
      })

      try {
        await resend.emails.send({
          from: 'SKF Academy <noreply@kungfubc.com>',
          to: user.email,
          subject: `Reminder: Your lesson is in ${window.hours === 24 ? '24 hours' : '2 hours'}`,
          html: `
            <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; background: #111; color: #fff; padding: 2rem; border-radius: 8px;">
              <h2 style="color: #cc0000; margin: 0 0 1rem;">⏰ Lesson Reminder</h2>
              <p style="color: #ccc;">Hi ${user.first_name || 'there'},</p>
              <p style="color: #ccc;">Just a reminder — your private lesson is coming up:</p>
              <div style="background: #2a2a2a; border: 1px solid #cc0000; border-radius: 8px; padding: 1rem; margin: 1rem 0;">
                <p style="margin: 0; font-size: 1.1rem; color: #fff; font-weight: bold;">${dateStr}</p>
                <p style="margin: 0.25rem 0 0; color: #cc0000;">${timeStr} — Private Lesson</p>
              </div>
              <p style="color: #666; font-size: 0.85rem;">If you need to cancel, please do so at least 24 hours before to receive a token refund.</p>
              <a href="https://app.kungfubc.com/dashboard" style="display: inline-block; margin-top: 1rem; padding: 0.75rem 1.5rem; background: #cc0000; color: #fff; text-decoration: none; border-radius: 6px; font-weight: bold;">View My Dashboard</a>
              <p style="color: #444; font-size: 0.75rem; margin-top: 2rem;">SKF Academy · Shaolin Kung Fu — Est. 1986<br>
              <a href="https://app.kungfubc.com/dashboard" style="color: #444;">Manage notification preferences</a></p>
            </div>
          `
        })
        results.push({ email: user.email, window: window.label, status: 'sent' })
      } catch (err) {
        results.push({ email: user.email, window: window.label, status: 'error', error: err.message })
      }
    }
  }

  return Response.json({ sent: results.length, results })
}
