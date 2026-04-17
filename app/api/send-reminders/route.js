import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import webpush from 'web-push'

const resend = new Resend(process.env.RESEND_API_KEY)

const INTERVALS = [
  { label: '48h', hours: 48, text: '48 hours' },
  { label: '24h', hours: 24, text: '24 hours' },
  { label: '12h', hours: 12, text: '12 hours' },
  { label: '2h',  hours: 2,  text: '2 hours'  },
]

// Convert a slot (date string + integer hour) from America/Vancouver to a UTC Date
function slotToUTC(slotDate, startHour) {
  const h = String(startHour).padStart(2, '0')
  for (const offset of ['-07:00', '-08:00']) {
    const d = new Date(`${slotDate}T${h}:00:00${offset}`)
    const vanHour = parseInt(
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Vancouver', hour: 'numeric', hour12: false,
      }).format(d)
    )
    if (vanHour === startHour) return d
  }
  return new Date(`${slotDate}T${h}:00:00-07:00`)
}

function formatHour(h) {
  if (h < 12) return `${h}:00 AM`
  if (h === 12) return '12:00 PM'
  return `${h - 12}:00 PM`
}

export async function GET(request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_EMAIL}`,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  )

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const now = new Date()

  // Fetch all confirmed bookings with slot + user data
  const { data: bookings } = await supabase
    .from('bookings')
    .select(`
      id, student_id,
      slots!bookings_slot_id_fkey (slot_date, start_hour),
      users!bookings_student_id_fkey (email, first_name, notify_2h, notify_12h, notify_24h, notify_48h)
    `)
    .eq('status', 'confirmed')

  // Fetch all push subscriptions keyed by user_id
  const { data: pushSubs } = await supabase.from('push_subscriptions').select('user_id, subscription')
  const pushByUser = {}
  for (const row of pushSubs || []) {
    if (!pushByUser[row.user_id]) pushByUser[row.user_id] = []
    pushByUser[row.user_id].push(row.subscription)
  }

  if (!bookings?.length) return Response.json({ sent: 0, results: [] })

  const results = []
  const WINDOW_MS = 25 * 60 * 1000 // ±25 min — safe for hourly cron

  for (const interval of INTERVALS) {
    const targetUTC = new Date(now.getTime() + interval.hours * 3600000)

    for (const booking of bookings) {
      const slot = booking.slots
      const user = booking.users
      if (!slot || !user) continue
      if (!user.email || user.email.includes('@skf-academy.internal')) continue

      // Respect per-user notification preferences (default: on if null/undefined)
      const prefKey = `notify_${interval.label}` // notify_48h, notify_24h, notify_12h, notify_2h
      if (user[prefKey] === false) continue

      // Check if this slot falls within the reminder window
      const slotUTC = slotToUTC(slot.slot_date, slot.start_hour)
      if (Math.abs(slotUTC - targetUTC) > WINDOW_MS) continue

      // Skip past slots
      if (slotUTC < now) continue

      // Deduplication: insert fails silently if already sent
      const { error: dupError } = await supabase
        .from('sent_reminders')
        .insert({ booking_id: booking.id, interval_label: interval.label })
      if (dupError) continue // already sent this reminder

      const dateStr = new Date(slot.slot_date + 'T00:00:00').toLocaleDateString('en-CA', {
        weekday: 'long', month: 'long', day: 'numeric',
      })
      const timeStr = formatHour(slot.start_hour)

      try {
        await resend.emails.send({
          from: 'SKF Academy <noreply@kungfubc.com>',
          to: user.email,
          subject: `⏰ Reminder: Your lesson is in ${interval.text}`,
          html: `
            <div style="font-family:sans-serif;max-width:500px;margin:0 auto;background:#111;color:#fff;padding:2rem;border-radius:8px;">
              <h2 style="color:#cc0000;margin:0 0 1rem;">⏰ Lesson Reminder</h2>
              <p style="color:#ccc;margin:0 0 0.5rem;">Hi ${user.first_name || 'there'},</p>
              <p style="color:#ccc;margin:0 0 1rem;">Your private lesson is coming up in <strong style="color:#fff;">${interval.text}</strong>:</p>
              <div style="background:#2a2a2a;border:1px solid #cc0000;border-radius:8px;padding:1.25rem;margin-bottom:1.25rem;">
                <div style="font-size:1.1rem;color:#fff;font-weight:bold;margin-bottom:0.25rem;">${dateStr}</div>
                <div style="color:#cc0000;font-weight:bold;">${timeStr} — Private Lesson</div>
              </div>
              <p style="color:#666;font-size:0.85rem;margin:0 0 1.25rem;">
                Need to cancel? Please do so at least 24 hours before your lesson to receive a token refund.
              </p>
              <a href="https://app.kungfubc.com/dashboard"
                style="display:inline-block;padding:0.75rem 1.5rem;background:#cc0000;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;">
                View My Dashboard
              </a>
              <p style="color:#333;font-size:0.75rem;margin-top:2rem;">
                SKF Academy · Shaolin Kung Fu — Est. 1986
              </p>
            </div>
          `,
        })
        results.push({ bookingId: booking.id, email: user.email, interval: interval.label, status: 'sent' })

        // Send push notification to all user's devices
        const subs = pushByUser[booking.student_id] || []
        const payload = JSON.stringify({
          title: `⏰ Lesson in ${interval.text}`,
          body: `${dateStr} at ${timeStr} — Private Lesson`,
          url: '/dashboard',
        })
        for (const sub of subs) {
          webpush.sendNotification(sub, payload).catch(async (err) => {
            // 410 Gone = subscription expired, remove it
            if (err.statusCode === 410) {
              await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
            }
          })
        }
      } catch (err) {
        // Roll back dedup record so it retries next run
        await supabase.from('sent_reminders')
          .delete().eq('booking_id', booking.id).eq('interval_label', interval.label)
        results.push({ bookingId: booking.id, interval: interval.label, status: 'error', error: err.message })
      }
    }
  }

  return Response.json({ sent: results.filter(r => r.status === 'sent').length, results })
}
