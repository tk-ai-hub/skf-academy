import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

function formatHour(h) {
  if (h < 12) return `${h}:00 AM`
  if (h === 12) return `12:00 PM`
  return `${h - 12}:00 PM`
}

function formatDate(d) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-CA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
}

export async function POST(request) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const { type, startDate, endDate, slotDate, slotHour, reason } = await request.json()

  // 1. Find affected slots
  let slotQuery = supabaseAdmin.from('slots').select('id, slot_date, start_hour, tenant_id')
  if (type === 'range') {
    slotQuery = slotQuery.gte('slot_date', startDate).lte('slot_date', endDate)
  } else {
    slotQuery = slotQuery.eq('slot_date', slotDate).eq('start_hour', slotHour)
  }
  const { data: affectedSlots } = await slotQuery
  if (!affectedSlots || affectedSlots.length === 0) {
    // Still block, just no bookings to cancel
    if (type === 'range') {
      await supabaseAdmin.from('slots').update({ is_blocked: true, block_reason: reason || 'Unavailable' }).gte('slot_date', startDate).lte('slot_date', endDate)
    } else {
      await supabaseAdmin.from('slots').update({ is_blocked: true, block_reason: reason || 'Unavailable' }).eq('slot_date', slotDate).eq('start_hour', slotHour)
    }
    return Response.json({ success: true, cancelled: 0 })
  }

  const slotIds = affectedSlots.map(s => s.id)

  // 2. Find confirmed bookings for those slots
  const { data: bookings } = await supabaseAdmin
    .from('bookings')
    .select('id, student_id, tenant_id, status, slot_id, slots!bookings_slot_id_fkey(slot_date, start_hour)')
    .in('slot_id', slotIds)
    .in('status', ['confirmed', 'pending_token'])

  // 3. Block the slots
  if (type === 'range') {
    await supabaseAdmin.from('slots').update({ is_blocked: true, block_reason: reason || 'Unavailable' }).gte('slot_date', startDate).lte('slot_date', endDate)
  } else {
    await supabaseAdmin.from('slots').update({ is_blocked: true, block_reason: reason || 'Unavailable' }).eq('slot_date', slotDate).eq('start_hour', slotHour)
  }

  if (!bookings || bookings.length === 0) {
    return Response.json({ success: true, cancelled: 0 })
  }

  // 4. Cancel each booking, refund token, send email
  let cancelled = 0
  for (const booking of bookings) {
    // Cancel booking
    await supabaseAdmin.from('bookings').update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancelled_by: 'admin',
    }).eq('id', booking.id)

    // Refund token only for confirmed (not pending_token — no token was charged)
    if (booking.status === 'confirmed') {
      await supabaseAdmin.from('tokens').insert({
        tenant_id: booking.tenant_id,
        student_id: booking.student_id,
        amount: 1,
        reason: 'slot blocked by admin — refund',
        booking_id: booking.id,
      })
    }

    // Get student email
    const { data: student } = await supabaseAdmin
      .from('users')
      .select('email, first_name, last_name')
      .eq('id', booking.student_id)
      .single()

    if (student?.email && !student.email.endsWith('@skf-academy.internal')) {
      const name = [student.first_name, student.last_name].filter(Boolean).join(' ') || student.email
      const slotInfo = booking.slots
      const dateLabel = slotInfo ? formatDate(slotInfo.slot_date) : 'your upcoming lesson'
      const timeLabel = slotInfo ? formatHour(slotInfo.start_hour) : ''
      const blockReason = reason || 'scheduling change'

      await resend.emails.send({
        from: 'SKF Academy <noreply@kungfubc.com>',
        to: student.email,
        subject: 'Your lesson has been rescheduled — SKF Academy',
        html: `
          <div style="font-family: Georgia, serif; max-width: 500px; margin: 0 auto; background: #1a1a1a; color: #fff; padding: 2rem; border-radius: 8px;">
            <div style="text-align: center; margin-bottom: 2rem;">
              <h1 style="color: #cc0000; letter-spacing: 3px; text-transform: uppercase; font-size: 1.5rem;">SKF Academy</h1>
              <p style="color: #666; font-size: 0.8rem; letter-spacing: 2px; text-transform: uppercase;">Shaolin Kung Fu — Est. 1986</p>
            </div>
            <h2 style="color: #fff;">Hi ${name},</h2>
            <p style="color: #ccc;">We need to cancel your upcoming lesson due to a ${blockReason}:</p>
            <div style="background: #2a2a2a; border-left: 3px solid #cc0000; padding: 1rem 1.5rem; margin: 1.5rem 0; border-radius: 4px;">
              <p style="margin: 0; color: #fff; font-size: 1.1rem;"><strong>${dateLabel}</strong></p>
              ${timeLabel ? `<p style="margin: 0.25rem 0 0; color: #cc0000;">${timeLabel}</p>` : ''}
            </div>
            <div style="background: #0a1f0a; border: 1px solid #2a6a2a; border-radius: 6px; padding: 1rem 1.5rem; margin: 1.5rem 0;">
              <p style="margin: 0; color: #66cc66; font-weight: bold;">✓ ${booking.status === 'confirmed' ? '1 token has been refunded to your account.' : 'Your reservation has been released (no token was charged).'}</p>
            </div>
            <p style="color: #ccc;">You can log in and book a new slot at your convenience:</p>
            <div style="text-align: center; margin: 1.5rem 0;">
              <a href="https://app.kungfubc.com/book" style="display: inline-block; background: #cc0000; color: #fff; text-decoration: none; padding: 0.9rem 2rem; border-radius: 4px; font-size: 1rem; letter-spacing: 1px; text-transform: uppercase;">Book a New Lesson</a>
            </div>
            <p style="color: #666; font-size: 0.85rem;">We apologize for the inconvenience. See you on the mat soon!</p>
            <hr style="border-color: #333; margin: 2rem 0;" />
            <p style="color: #444; font-size: 0.8rem; text-align: center;">SKF Academy · app.kungfubc.com</p>
          </div>
        `
      })
    }

    cancelled++
  }

  return Response.json({ success: true, cancelled })
}
