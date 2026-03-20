import { createClient } from '@supabase/supabase-js'
import { google } from 'googleapis'

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

  return Response.json({ fulfilled })
}
