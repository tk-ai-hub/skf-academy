import { createClient } from '@supabase/supabase-js'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

export async function POST(request) {
  const { userId, awayUntil, clearAway } = await request.json()
  if (!userId) return Response.json({ error: 'userId required' }, { status: 400 })

  if (clearAway) {
    await sb.from('users').update({ away_mode: false, away_until: null }).eq('id', userId)
    return Response.json({ success: true, cleared: true })
  }

  // Set away mode
  await sb.from('users').update({ away_mode: true, away_until: awayUntil || null }).eq('id', userId)

  // Cancel all future confirmed bookings (within away period if end date set)
  const today = new Date().toISOString().split('T')[0]
  const { data: futureBookings } = await sb
    .from('bookings')
    .select('id, tenant_id, slots!bookings_slot_id_fkey(slot_date)')
    .eq('student_id', userId)
    .eq('status', 'confirmed')

  const toCancel = (futureBookings || []).filter(b => {
    if (!b.slots?.slot_date) return false
    if (b.slots.slot_date < today) return false
    if (awayUntil && b.slots.slot_date > awayUntil) return false
    return true
  })

  let refunded = 0
  for (const booking of toCancel) {
    await sb.from('bookings').update({ status: 'cancelled' }).eq('id', booking.id)
    await sb.from('tokens').insert({
      tenant_id: booking.tenant_id,
      student_id: userId,
      amount: 1,
      reason: 'away mode — lesson auto-released',
      booking_id: booking.id
    })
    refunded++
  }

  return Response.json({ success: true, cancelled: refunded, refunded })
}
