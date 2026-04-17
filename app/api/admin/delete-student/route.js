import { createClient } from '@supabase/supabase-js'

export async function POST(request) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const { studentId } = await request.json()
  if (!studentId) return Response.json({ error: 'studentId is required' }, { status: 400 })

  // Get all booking IDs for this student
  const { data: studentBookings, error: fetchErr } = await supabaseAdmin
    .from('bookings').select('id').eq('student_id', studentId)
  if (fetchErr) return Response.json({ error: 'fetch bookings: ' + fetchErr.message }, { status: 500 })

  const bookingIds = (studentBookings || []).map(b => b.id)

  // 1. Delete tokens (tokens.booking_id -> bookings.id and tokens.student_id -> users.id)
  const { error: e1 } = await supabaseAdmin.from('tokens').delete().eq('student_id', studentId)
  if (e1) return Response.json({ error: 'delete tokens: ' + e1.message }, { status: 500 })

  // 2. Delete sent_reminders (sent_reminders.booking_id -> bookings.id)
  if (bookingIds.length > 0) {
    const { error: e2 } = await supabaseAdmin.from('sent_reminders').delete().in('booking_id', bookingIds)
    if (e2) return Response.json({ error: 'delete sent_reminders: ' + e2.message }, { status: 500 })
  }

  // 3. Delete bookings
  const { error: e3 } = await supabaseAdmin.from('bookings').delete().eq('student_id', studentId)
  if (e3) return Response.json({ error: 'delete bookings: ' + e3.message }, { status: 500 })

  // 4. Delete push subscriptions (may not exist yet — ignore error)
  await supabaseAdmin.from('push_subscriptions').delete().eq('user_id', studentId)

  // 5. Delete user profile row
  const { error: e5 } = await supabaseAdmin.from('users').delete().eq('id', studentId)
  if (e5) return Response.json({ error: 'delete users row: ' + e5.message }, { status: 500 })

  // 6. Delete auth user
  const { error: e6 } = await supabaseAdmin.auth.admin.deleteUser(studentId)
  if (e6) return Response.json({ error: 'delete auth user: ' + e6.message }, { status: 500 })

  return Response.json({ success: true })
}
