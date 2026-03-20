import { createClient } from '@supabase/supabase-js'

export async function POST(request) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const { studentId, firstName, lastName, phone, dob, beltRank } = await request.json()

  if (!studentId) return Response.json({ error: 'studentId is required' }, { status: 400 })

  const updates = {}
  if (firstName !== undefined) updates.first_name = firstName
  if (lastName !== undefined) updates.last_name = lastName
  if (firstName !== undefined || lastName !== undefined) {
    updates.full_name = [firstName, lastName].filter(Boolean).join(' ')
  }
  if (phone !== undefined) updates.phone = phone
  if (dob !== undefined) updates.date_of_birth = dob || null
  if (beltRank !== undefined) updates.belt_rank = beltRank

  const { error } = await supabaseAdmin.from('users').update(updates).eq('id', studentId)

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ success: true })
}
