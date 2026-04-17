import { createClient } from '@supabase/supabase-js'

export async function POST(request) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const { studentId } = await request.json()
  if (!studentId) return Response.json({ error: 'studentId is required' }, { status: 400 })

  // Get all booking IDs for this student
  const { data: studentBookings } = await supabaseAdmin
    .from('bookings')
    .select('id')
    .eq('student_id', studentId)

  const bookingIds = (studentBookings || []).map(b => b.id)

  // Delete tokens first (tokens.booking_id -> bookings.id)
  await supabaseAdmin.from('tokens').delete().eq('student_id', studentId)

  // Delete sent_reminders (sent_reminders.booking_id -> bookings.id)
  if (bookingIds.length > 0) {
    await supabaseAdmin.from('sent_reminders').delete().in('booking_id', bookingIds)
  }

  // Now safe to delete bookings (bookings.student_id -> users.id)
  await supabaseAdmin.from('bookings').delete().eq('student_id', studentId)

  // Delete push subscriptions
  await supabaseAdmin.from('push_subscriptions').delete().eq('user_id', studentId)

  // Delete user profile row
  const { error: userError } = await supabaseAdmin.from('users').delete().eq('id', studentId)
  if (userError) return Response.json({ error: 'Could not delete user profile: ' + userError.message }, { status: 500 })

  // Delete auth user (must be last)
  const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(studentId)
  if (authError) return Response.json({ error: 'Could not delete auth user: ' + authError.message }, { status: 500 })

  return Response.json({ success: true })
}
