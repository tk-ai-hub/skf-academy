import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
const resend = new Resend(process.env.RESEND_API_KEY)
import { google } from 'googleapis'

async function getCalendarClient() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY)
  const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/calendar'] })
  return google.calendar({ version: 'v3', auth })
}

async function addToGoogleCalendar(date, hour, studentName, phone) {
  try {
    const calendar = await getCalendarClient()
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
    console.error('Admin-book calendar error:', err.message)
  }
}

export async function POST(request) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const { studentId, guestFirstName, guestLastName, guestPhone, slotId } = await request.json()

  if (!slotId) return Response.json({ error: 'slotId is required' }, { status: 400 })
  if (!studentId && !guestFirstName) return Response.json({ error: 'studentId or guest name is required' }, { status: 400 })

  // Get slot
  const { data: slot, error: slotError } = await supabaseAdmin
    .from('slots')
    .select('*')
    .eq('id', slotId)
    .single()
  if (slotError || !slot) return Response.json({ error: 'Slot not found' }, { status: 404 })

  // Check slot has capacity (max 2 bookings per slot)
  const { data: existing } = await supabaseAdmin
    .from('bookings')
    .select('id')
    .eq('slot_id', slotId)
    .in('status', ['confirmed', 'pending_token'])
  if ((existing || []).length >= 2) return Response.json({ error: 'This slot is fully booked (2/2)' }, { status: 409 })

  let userId = studentId
  let studentName = ''
  let studentPhone = ''

  if (!studentId) {
    // Create walk-in user with synthetic internal email
    const sanitizedPhone = (guestPhone || '').replace(/\D/g, '')
    const email = `walkin-${sanitizedPhone || 'guest'}-${Date.now()}@skf-academy.internal`
    const fullName = [guestFirstName, guestLastName].filter(Boolean).join(' ')

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true
    })
    if (authError) return Response.json({ error: 'Could not create guest user: ' + authError.message }, { status: 500 })

    const { error: insertError } = await supabaseAdmin.from('users').insert({
      id: authData.user.id,
      tenant_id: slot.tenant_id,
      email,
      first_name: guestFirstName,
      last_name: guestLastName || '',
      full_name: fullName,
      phone: guestPhone || '',
      role: 'student'
    })
    if (insertError) return Response.json({ error: 'Could not create guest profile: ' + insertError.message }, { status: 500 })

    userId = authData.user.id
    studentName = fullName
    studentPhone = guestPhone || ''
  } else {
    const { data: profile } = await supabaseAdmin
      .from('users')
      .select('first_name, last_name, full_name, phone')
      .eq('id', studentId)
      .single()
    studentName = profile?.full_name || [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Unknown'
    studentPhone = profile?.phone || ''
  }

  // Insert booking (no token deduction — admin-initiated)
  const { data: booking, error: bookingError } = await supabaseAdmin
    .from('bookings')
    .insert({
      tenant_id: slot.tenant_id,
      student_id: userId,
      slot_id: slotId,
      status: 'confirmed'
    })
    .select()
    .single()

  if (bookingError) return Response.json({ error: bookingError.message }, { status: 500 })

  // Add to Google Calendar
  await addToGoogleCalendar(slot.slot_date, slot.start_hour, studentName, studentPhone || 'No phone')

  // Deduct token if registered student (not guest)
  if (studentId) {
    await supabaseAdmin.from('tokens').insert({ tenant_id: slot.tenant_id, student_id: userId, amount: -1, reason: 'lesson booked by admin', booking_id: booking.id })
  }

  // Send confirmation email to student
  try {
    const { data: profile } = await supabaseAdmin.from('users').select('email,first_name').eq('id', userId).single()
    if (profile?.email && !profile.email.includes('@skf-academy.internal')) {
      const h = slot.start_hour
      const timeStr = h < 12 ? h+':00 AM' : h === 12 ? '12:00 PM' : (h-12)+':00 PM'
      const ds = new Date(slot.slot_date+'T00:00:00').toLocaleDateString('en-CA', { weekday:'long', month:'long', day:'numeric' })
      await resend.emails.send({
        from: 'SKF Academy <noreply@kungfubc.com>',
        to: profile.email,
        subject: 'Your lesson has been booked',
        html: '<div style="font-family:sans-serif;background:#111;color:#fff;padding:2rem;border-radius:8px;max-width:500px"><h2 style="color:#cc0000">Lesson Booked</h2><p>Hi '+(profile.first_name||'there')+',</p><p>A lesson has been booked for you on <strong>'+ds+' at '+timeStr+'</strong>.</p><a href="https://app.kungfubc.com/dashboard" style="display:inline-block;margin-top:1rem;padding:0.75rem 1.5rem;background:#cc0000;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold">View Dashboard</a></div>'
      })
    }
  } catch(emailErr) { console.error('Email error:', emailErr.message) }

  return Response.json({ success: true, booking, studentName, studentId: userId })
}
