import { createClient } from '@supabase/supabase-js'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

export async function POST(request) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }
  const token = authHeader.slice(7)

  // Verify the caller's identity via their JWT
  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
  const { data: { user }, error: authError } = await userClient.auth.getUser()
  if (authError || !user) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { slotIds, tenantId, isRecurring, recurringGroupId } = body

  if (!Array.isArray(slotIds) || slotIds.length === 0) {
    return Response.json({ error: 'no slots provided' }, { status: 400 })
  }

  const results = []
  for (const slotId of slotIds) {
    const { data, error } = await sb.rpc('book_slot_atomic', {
      p_tenant_id: tenantId,
      p_student_id: user.id,
      p_slot_id: slotId,
      p_is_recurring: isRecurring || false,
      p_recurring_group_id: recurringGroupId || null,
    })

    if (error) {
      results.push({ slotId, error: error.message })
      continue
    }

    const result = typeof data === 'string' ? JSON.parse(data) : data

    if (result.error) {
      results.push({ slotId, error: result.error })
      continue
    }

    // Deduct token only after confirmed booking
    await sb.from('tokens').insert({
      tenant_id: tenantId,
      student_id: user.id,
      amount: -1,
      reason: isRecurring ? 'recurring lesson booked' : 'lesson booked',
      booking_id: result.id,
    })

    results.push({ slotId, booking: result })
  }

  return Response.json(results)
}
