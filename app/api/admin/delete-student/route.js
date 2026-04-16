import { createClient } from '@supabase/supabase-js'

export async function POST(request) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const { studentId } = await request.json()
  if (!studentId) return Response.json({ error: 'studentId is required' }, { status: 400 })

  // Cancel all their bookings (no refund — admin delete)
  await supabaseAdmin
    .from('bookings')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancelled_by: 'admin' })
    .eq('student_id', studentId)
    .in('status', ['confirmed', 'pending_token'])

  // Delete tokens
  await supabaseAdmin.from('tokens').delete().eq('student_id', studentId)

  // Delete user profile row
  await supabaseAdmin.from('users').delete().eq('id', studentId)

  // Delete auth user (must be last)
  const { error } = await supabaseAdmin.auth.admin.deleteUser(studentId)
  if (error) return Response.json({ error: 'Could not delete auth user: ' + error.message }, { status: 500 })

  return Response.json({ success: true })
}
