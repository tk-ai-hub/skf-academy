import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { google } from 'googleapis'
const resend = new Resend(process.env.RESEND_API_KEY)

async function addToGoogleCalendar(date, hour, studentName, phone) {
  try {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY)
    const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/calendar'] })
    const calendar = google.calendar({ version: 'v3', auth })
    const hourPadded = String(hour).padStart(2, '0')
    const endHour = String(hour + 1).padStart(2, '0')
    await calendar.events.insert({
      calendarId: process.env.GOOGLE_CALENDAR_ID,
      requestBody: {
        summary: `${studentName} - ${phone}`,
        description: `Private Kung Fu Lesson\nStudent: ${studentName}\nPhone: ${phone}`,
        start: { dateTime: `${date}T${hourPadded}:00:00`, timeZone: 'America/Vancouver' },
        end: { dateTime: `${date}T${endHour}:00:00`, timeZone: 'America/Vancouver' }
      }
    })
  } catch (err) {
    console.error('Calendar error:', err.message)
  }
}

export async function POST(request) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const { studentId } = await request.json()
  if (!studentId) return Response.json({ error: 'studentId required' }, { status: 400 })

  // Get current token balance
  const { data: tokenData } = await supabaseAdmin.from('tokens').select('amount').eq('student_id', studentId)
  const balance = (tokenData || []).reduce((sum, t) => sum + t.amount, 0)
  if (balance <= 0) return Response.json({ fulfilled: 0 })

  // Get oldest pending bookings up to balance count
  const { data: pending } = await supabaseAdmin
    .from('bookings')
    .select('*, slots!bookings_slot_id_fkey(slot_date, start_hour)')
    .eq('student_id', studentId)
    .eq('status', 'pending_token')
    .order('booked_at', { ascending: true })
    .limit(balance)

  if (!pending?.length) return Response.json({ fulfilled: 0 })

  const { data: student } = await supabaseAdmin
    .from('users').select('first_name, last_name, full_name, phone').eq('id', studentId).single()
  const studentName = student?.full_name || [student?.last_name, student?.first_name].filter(Boolean).join(' ') || 'Student'
  const phone = student?.phone || 'No phone'

  let fulfilled = 0
  for (const booking of pending) {
    await supabaseAdmin.from('bookings').update({ status: 'confirmed' }).eq('id', booking.id)
    await supabaseAdmin.from('tokens').insert({
      tenant_id: booking.tenant_id,
      student_id: studentId,
      amount: -1,
      reason: 'recurring slot fulfilled',
      booking_id: booking.id
    })
    if (booking.slots) {
      await addToGoogleCalendar(booking.slots.slot_date, booking.slots.start_hour, studentName, phone)
    }
    fulfilled++
  }

  // Check new balance and alert admin if low
  const { data: tokenRows } = await supabaseAdmin.from('tokens').select('amount').eq('student_id', studentId)
  const newBalance = (tokenRows || []).reduce((sum, t) => sum + t.amount, 0)
  if (newBalance <= 1) {
    try {
      await resend.emails.send({
        from: 'SKF Academy <noreply@kungfubc.com>',
        to: 'kungfuscheduling@gmail.com',
        subject: newBalance === 0 ? `⚠️ ${studentName} is out of tokens` : `⚠️ ${studentName} has 1 token left`,
        html: `<div style="font-family:sans-serif;background:#111;color:#fff;padding:2rem;border-radius:8px;max-width:500px"><h2 style="color:#cc0000">Low Token Alert</h2><p><strong>${studentName}</strong> now has <strong style="color:${newBalance === 0 ? '#cc0000' : '#cc8800'}">${newBalance} token${newBalance === 1 ? '' : 's'}</strong> remaining.</p><a href="https://app.kungfubc.com/admin" style="display:inline-block;margin-top:1rem;padding:0.75rem 1.5rem;background:#cc0000;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold">View Admin</a></div>`
      })
    } catch(e) { console.error('Low token alert error:', e.message) }
  }

  return Response.json({ fulfilled })
}
