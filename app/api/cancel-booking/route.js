import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const resend = new Resend(process.env.RESEND_API_KEY)

function timeStr(h) {
  return h < 12 ? h+':00 AM' : h === 12 ? '12:00 PM' : (h-12)+':00 PM'
}

async function deleteCalEvent(slotDate, slotHour) {
  try {
    const { google } = await import('googleapis')
    const auth = new google.auth.GoogleAuth({ credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY), scopes: ['https://www.googleapis.com/auth/calendar'] })
    const cal = google.calendar({ version: 'v3', auth })
    const h = String(slotHour).padStart(2, '0')
    const h2 = String(slotHour + 1).padStart(2, '0')
    const events = await cal.events.list({ calendarId: process.env.GOOGLE_CALENDAR_ID, timeMin: slotDate+'T'+h+':00:00-08:00', timeMax: slotDate+'T'+h2+':00:00-08:00', singleEvents: true })
    for (const e of events.data.items || []) {
      await cal.events.delete({ calendarId: process.env.GOOGLE_CALENDAR_ID, eventId: e.id })
    }
  } catch (e) { console.error('Calendar delete:', e.message) }
}

export async function POST(req) {
  try {
    const { bookingId, cancelSeries } = await req.json()
    if (!bookingId) return Response.json({ error: 'bookingId required' }, { status: 400 })

    const { data: booking, error } = await sb.from('bookings')
      .select('id,tenant_id,student_id,recurring_group_id,slots!bookings_slot_id_fkey(slot_date,start_hour),users!bookings_student_id_fkey(email,first_name,last_name)')
      .eq('id', bookingId).single()

    if (error || !booking) return Response.json({ error: 'Booking not found' }, { status: 404 })

    let toCancel = [booking]
    if (cancelSeries && booking.recurring_group_id) {
      const { data } = await sb.from('bookings').select('id,tenant_id,student_id,slots!bookings_slot_id_fkey(slot_date,start_hour)').eq('recurring_group_id', booking.recurring_group_id).eq('status', 'confirmed')
      toCancel = data || [booking]
    }

    const now = new Date()
    let refunded = 0

    for (const b of toCancel) {
      const within24 = (new Date(b.slots.slot_date+'T'+String(b.slots.start_hour).padStart(2,'0')+':00:00') - now) < 86400000
      await sb.from('bookings').update({ status: 'cancelled', cancelled_at: now.toISOString() }).eq('id', b.id)
      if (!within24) {
        await sb.from('tokens').insert({ tenant_id: b.tenant_id, student_id: b.student_id, amount: 1, reason: 'cancelled - refund', booking_id: b.id })
        refunded++
      }
      await deleteCalEvent(b.slots.slot_date, b.slots.start_hour)
    }

    const u = booking.users
    const name = u?.first_name ? (u.first_name+' '+(u.last_name||'')).trim() : u?.email
    const h = booking.slots.start_hour
    const ts = timeStr(h)
    const ds = new Date(booking.slots.slot_date+'T00:00:00').toLocaleDateString('en-CA', { weekday:'long', month:'long', day:'numeric' })

    if (u?.email) {
      await resend.emails.send({
        from: 'SKF Academy <noreply@kungfubc.com>', to: u.email, subject: 'Your lesson has been cancelled',
        html: '<div style="font-family:sans-serif;background:#111;color:#fff;padding:2rem;border-radius:8px;max-width:500px"><h2 style="color:#cc0000">Booking Cancelled</h2><p>Hi '+(u.first_name||'there')+',</p><p>Your lesson on <strong>'+ds+' at '+ts+'</strong> has been cancelled.</p>'+(refunded > 0 ? '<p style="color:#66cc66">1 token refunded.</p>' : '<p style="color:#aa6600">No refund - within 24 hours.</p>')+'<a href="https://app.kungfubc.com/book" style="display:inline-block;margin-top:1rem;padding:0.75rem 1.5rem;background:#cc0000;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold">Book Again</a></div>'
      })
    }
    await resend.emails.send({
      from: 'SKF Academy <noreply@kungfubc.com>', to: 'kungfuscheduling@gmail.com',
      subject: 'Cancellation: '+name+' - '+ds+' at '+ts,
      html: '<p>'+name+' cancelled on '+ds+' at '+ts+'. '+(refunded > 0 ? '1 token refunded.' : 'No refund (within 24hrs).')+'</p>'
    })

    return Response.json({ success: true, refunded, cancelled: toCancel.length })
  } catch (err) {
    console.error('Cancel error:', err)
    return Response.json({ error: err.message }, { status: 500 })
  }
}
