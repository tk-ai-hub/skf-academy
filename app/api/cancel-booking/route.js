import { createClient } from '@supabase/supabase-js'
import { google } from 'googleapis'
import { Resend } from 'resend'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)
const resend = new Resend(process.env.RESEND_API_KEY)

async function deleteCalendarEvent(bookingId) {
  try {
    const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY)
    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccount,
      scopes: ['https://www.googleapis.com/auth/calendar']
    })
    const calendar = google.calendar({ version: 'v3', auth })

    // Find event by bookingId in extendedProperties
    const events = await calendar.events.list({
      calendarId: process.env.GOOGLE_CALENDAR_ID,
      privateExtendedProperty: `bookingId=${bookingId}`,
    })

    for (const event of (events.data.items || [])) {
      await calendar.events.delete({
        calendarId: process.env.GOOGLE_CALENDAR_ID,
        eventId: event.id,
      })
    }
  } catch (err) {
    console.error('Calendar delete error:', err.message)
  }
}

export async function POST(request) {
  try {
    const { bookingId, cancelSeries } = await request.json()

    // Get booking with slot and student info
    const { data: booking, error } = await supabase
      .from('bookings')
      .select(`
        id, tenant_id, student_id, recurring_group_id, is_recurring,
        slots!bookings_slot_id_fkey (slot_date, start_hour),
        users!bookings_student_id_fkey (email, first_name, last_name, phone)
      `)
      .eq('id', bookingId)
      .single()

    if (error || !booking) {
      return Response.json({ error: 'Booking not found' }, { status: 404 })
    }

    // Determine which bookings to cancel
    let bookingsToCancel = [booking]
    if (cancelSeries && booking.recurring_group_id) {
      const { data: series } = await supabase
        .from('bookings')
        .select(`id, tenant_id, student_id, slots!bookings_slot_id_fkey (slot_date, start_hour)`)
        .eq('recurring_group_id', booking.recurring_group_id)
        .eq('status', 'confirmed')
      bookingsToCancel = series || [booking]
    }

    let refunded = 0
    const now = new Date()

    for (const b of bookingsToCancel) {
      const slotTime = new Date(`${b.slots.slot_date}T${String(b.slots.start_hour).padStart(2,'0')}:00:00`)
      const within24 = (slotTime - now) < 24 * 60 * 60 * 1000

      // Cancel in DB
      await supabase.from('bookings').update({
        status: 'cancelled',
        cancelled_at: now.toISOString(),
        cancelled_within_24h: within24
      }).eq('id', b.id)

      // Refund token if outside 24hrs
      if (!within24) {
        await supabase.from('tokens').insert({
          tenant_id: b.tenant_id,
          student_id: b.student_id,
          amount: 1,
          reason: cancelSeries ? 'series cancelled - refund' : 'lesson cancelled - refund',
          booking_id: b.id
        })
        refunded++
      }

      // Delete from Google Calendar
      await deleteCalendarEvent(b.id)

      // Re-open the slot
      await supabase.from('slots').update({ is_blocked: false }).eq('id', b.slots?.id).eq('is_blocked', true)
    }

    // Send cancellation email
    const user = booking.users
    const studentName = user?.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : user?.email
    const h = booking.slots.start_hour
    const timeStr = h < 12 ? `${h}:00 AM` : h === 12 ? '12:00 PM' : `${h-12}:00 PM`
    const dateStr = new Date(booking.slots.slot_date + 'T00:00:00').toLocaleDateString('en-CA', {
      weekday: 'long', month: 'long', day: 'numeric'
    })

    if (user?.email) {
      await resend.emails.send({
        from: 'SKF Academy <noreply@kungfubc.com>',
        to: user.email,
        subject: cancelSeries ? 'Your recurring lessons have been cancelled' : 'Your lesson has been cancelled',
        html: `
          <div style="font-family:sans-serif;max-width:500px;margin:0 auto;background:#111;color:#fff;padding:2rem;border-radius:8px;">
            <h2 style="color:#cc0000;margin:0 0 1rem;">Booking Cancelled</h2>
            <p style="color:#ccc;">Hi ${user.first_name || 'there'},</p>
            <p style="color:#ccc;">${cancelSeries ? `Your recurring lesson series has been cancelled.` : `Your lesson on <strong>${dateStr} at ${timeStr}</strong> has been cancelled.`}</p>
            ${refunded > 0 ? `<p style="color:#66cc66;">✓ ${refunded} token${refunded>1?'s':''} refunded to your account.</p>` : `<p style="color:#aa6600;">⚠️ No token refund — cancelled within 24 hours.</p>`}
            <a href="https://app.kungfubc.com/book" style="display:inline-block;margin-top:1rem;padding:0.75rem 1.5rem;background:#cc0000;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;">Book Another Lesson</a>
          </div>
        `
      })
    }

    // Notify admin
    await resend.emails.send({
      from: 'SKF Academy <noreply@kungfubc.com>',
      to: 'kungfuscheduling@gmail.com',
      subject: `Cancellation: ${studentName} — ${dateStr} at ${timeStr}`,
      html: `<p>${studentName} cancelled their lesson on ${dateStr} at ${timeStr}. ${refunded > 0 ? `${refunded} token(s) refunded.` : 'No refund (within 24hrs).'}</p>`
    })

    return Response.json({ success: true, refunded, cancelled: bookingsToCancel.length })
  } catch (err) {
    console.error('Cancel error:', err)
    return Response.json({ error: err.message }, { status: 500 })
  }
}
