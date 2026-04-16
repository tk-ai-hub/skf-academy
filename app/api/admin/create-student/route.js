import { createClient } from '@supabase/supabase-js'

export async function POST(request) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const { firstName, lastName, email, phone, beltRank, dob, initialTokens } = await request.json()
  if (!firstName?.trim()) return Response.json({ error: 'First name is required' }, { status: 400 })
  if (!email?.trim()) return Response.json({ error: 'Email is required' }, { status: 400 })

  // Get tenant id
  const { data: tenant } = await supabase.from('tenants').select('id').eq('slug', 'skf-academy').single()
  if (!tenant) return Response.json({ error: 'Tenant not found' }, { status: 500 })

  // Create auth user (sends invite email if email is real)
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: email.trim().toLowerCase(),
    email_confirm: true,
    user_metadata: { first_name: firstName.trim(), last_name: lastName?.trim() || '' },
  })
  if (authError) return Response.json({ error: authError.message }, { status: 400 })

  const fullName = [firstName.trim(), lastName?.trim()].filter(Boolean).join(' ')

  // Upsert profile (trigger may have already created a row)
  const { error: profileError } = await supabase.from('users').upsert({
    id: authData.user.id,
    tenant_id: tenant.id,
    email: email.trim().toLowerCase(),
    first_name: firstName.trim(),
    last_name: lastName?.trim() || '',
    full_name: fullName,
    phone: phone?.trim() || '',
    belt_rank: beltRank || null,
    date_of_birth: dob || null,
    role: 'student',
  }, { onConflict: 'id' })
  if (profileError) return Response.json({ error: profileError.message }, { status: 500 })

  // Add initial tokens if specified
  if (initialTokens && parseInt(initialTokens) > 0) {
    await supabase.from('tokens').insert({
      tenant_id: tenant.id,
      student_id: authData.user.id,
      amount: parseInt(initialTokens),
      reason: 'initial tokens — added by admin',
    })
  }

  return Response.json({ success: true, userId: authData.user.id, fullName })
}
