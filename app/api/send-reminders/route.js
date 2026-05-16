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
      users!bookings_student_id_fkey (email, first_name, notify_2h, notify_12h, notify_24h, notify_48h, away_mode)
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

      // Skip students in away mode
      if (user.away_mode) continue

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

  // --- Skill Development Class reminder (every Tuesday & Thursday) ---
  const nowVan = new Date(now.toLocaleString('en-US', { timeZone: 'America/Vancouver' }))
  if (nowVan.getDay() === 2 || nowVan.getDay() === 4) { // Tuesday or Thursday
    const { data: skillStudents } = await supabase
      .from('users')
      .select('id, email, first_name, notify_skill_class, away_mode')
      .eq('role', 'student')

    for (const student of (skillStudents || [])) {
      if (!student.email || student.email.includes('@skf-academy.internal')) continue
      if (student.away_mode) continue
      if (student.notify_skill_class === false) continue

      const dayName = nowVan.getDay() === 2 ? 'Tuesday' : 'Thursday'

      // Send email
      try {
        await resend.emails.send({
          from: 'SKF Academy <noreply@kungfubc.com>',
          to: student.email,
          subject: `🥋 Skill Development Class tonight at 9 PM — SKF Academy`,
          html: `<div style="font-family:sans-serif;background:#111;color:#fff;padding:2rem;border-radius:8px;max-width:500px"><h2 style="color:#cc0000">🥋 Skill Development Class Tonight</h2><p>Hi ${student.first_name || 'there'},</p><p>Don't miss tonight's <strong>Skill Development Class at 9 PM</strong>!</p><p style="color:#ccc;">This class is designed to grow your skills at every level. Whether you're just starting out or have years of experience, tonight's session will help take your training to the next level.</p><div style="background:#0a1020;border:1px solid #1a4a8a;border-radius:8px;padding:1.25rem;margin:1.5rem 0"><div style="color:#6699cc;font-size:0.75rem;letter-spacing:1px;text-transform:uppercase;margin-bottom:0.4rem">Tonight's Class</div><div style="color:#fff;font-weight:bold;font-size:1.1rem">${dayName} · 9:00 PM</div><div style="color:#aaa;font-size:0.9rem;margin-top:0.25rem">Skill Development — All Levels Welcome</div></div><p style="color:#999;font-size:0.9rem;">See you on the floor! 🙏</p><p style="color:#444;font-size:0.8rem;margin-top:2rem;">SKF Academy · Shaolin Kung Fu — Est. 1986</p></div>`
        })
      } catch(e) { console.error('Skill class email error:', e.message) }

      // Send push notification
      const subs = pushByUser[student.id] || []
      const payload = JSON.stringify({
        title: '🥋 Skill Development Class tonight at 9 PM',
        body: 'Essential for growth at all levels — see you on the floor!',
        url: '/dashboard',
      })
      for (const sub of subs) {
        webpush.sendNotification(sub, payload).catch(async (err) => {
          if (err.statusCode === 410) {
            await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
          }
        })
      }
    }
  }

  // --- No upcoming booking notifications (runs every Wednesday & Friday) ---
  if (nowVan.getDay() === 3 || nowVan.getDay() === 5) { // Wednesday or Friday
    const today = now.toISOString().split('T')[0]
    const in7Days = new Date(now.getTime() + 7 * 86400000).toISOString().split('T')[0]

    // Get all active students with real emails
    const { data: allStudents } = await supabase
      .from('users')
      .select('id, email, first_name, away_mode')
      .eq('role', 'student')

    // Get all confirmed bookings in next 7 days
    const { data: upcomingBookings } = await supabase
      .from('bookings')
      .select('student_id, slots!bookings_slot_id_fkey(slot_date)')
      .eq('status', 'confirmed')
      .gte('slots.slot_date', today)
      .lte('slots.slot_date', in7Days)

    const studentsWithBooking = new Set((upcomingBookings || []).filter(b => b.slots).map(b => b.student_id))

    for (const student of (allStudents || [])) {
      if (!student.email || student.email.includes('@skf-academy.internal')) continue
      if (student.away_mode) continue
      if (studentsWithBooking.has(student.id)) continue

      // Send email
      try {
        await resend.emails.send({
          from: 'SKF Academy <noreply@kungfubc.com>',
          to: student.email,
          subject: '📅 No lesson booked this week — SKF Academy',
          html: `<div style="font-family:sans-serif;background:#111;color:#fff;padding:2rem;border-radius:8px;max-width:500px"><h2 style="color:#cc0000">No Lesson This Week</h2><p>Hi ${student.first_name || 'there'},</p><p>You don't have a private lesson booked for the next 7 days. Keep up your training — book a slot now!</p><a href="https://app.kungfubc.com/book" style="display:inline-block;margin-top:1rem;padding:0.75rem 1.5rem;background:#cc0000;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold">Book a Lesson</a><p style="color:#444;font-size:0.8rem;margin-top:2rem;">SKF Academy · Shaolin Kung Fu — Est. 1986</p></div>`
        })
      } catch(e) { console.error('No-booking email error:', e.message) }

      // Send push notification
      const subs = pushByUser[student.id] || []
      const payload = JSON.stringify({
        title: '📅 No lesson booked this week',
        body: 'Keep up your training — tap to book a lesson.',
        url: '/book',
      })
      for (const sub of subs) {
        webpush.sendNotification(sub, payload).catch(async (err) => {
          if (err.statusCode === 410) {
            await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
          }
        })
      }
    }
  }

  return Response.json({ sent: results.filter(r => r.status === 'sent').length, results })
}
