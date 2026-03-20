import { createClient } from '@supabase/supabase-js'

export async function POST(request) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const { email, password, firstName, lastName, phone, dob, trialToken } = await request.json()

  if (!email || !password) {
    return Response.json({ error: 'Email and password are required' }, { status: 400 })
  }

  // Create auth user via admin API — bypasses any broken trigger flow
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: false, // sends confirmation email
  })

  if (authError) {
    console.error('Auth signup error:', authError)
    return Response.json({ error: authError.message }, { status: 400 })
  }

  const userId = authData.user.id

  // Get tenant
  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('id')
    .eq('slug', 'skf-academy')
    .single()

  // Upsert profile
  const { error: profileError } = await supabaseAdmin.from('users').upsert({
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

  if (profileError) {
    console.error('Profile upsert error:', profileError)
    // Don't fail — auth user was created, profile can be fixed later
  }

  // Add trial token if requested
  if (trialToken && tenant?.id) {
    await supabaseAdmin.from('tokens').insert({
      tenant_id: tenant.id,
      student_id: userId,
      amount: 1,
      reason: 'free trial lesson'
    })
  }

  return Response.json({ success: true })
}
