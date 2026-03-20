import { createClient } from '@supabase/supabase-js'

export async function POST(request) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const { userId, email, firstName, lastName, phone, dob, trialToken } = await request.json()

  if (!userId || !email) return Response.json({ error: 'userId and email are required' }, { status: 400 })

  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('id')
    .eq('slug', 'skf-academy')
    .single()

  const { error } = await supabaseAdmin.from('users').upsert({
    id: userId,
    tenant_id: tenant?.id,
    email,
    first_name: firstName || '',
    last_name: lastName || '',
    full_name: [firstName, lastName].filter(Boolean).join(' '),
    phone: phone || '',
    date_of_birth: dob || null,
    role: 'student'
  }, { onConflict: 'id' })

  if (error) return Response.json({ error: error.message }, { status: 500 })

  if (trialToken) {
    await supabaseAdmin.from('tokens').insert({
      tenant_id: tenant?.id,
      student_id: userId,
      amount: 1,
      reason: 'free trial lesson'
    })
  }

  return Response.json({ success: true })
}
