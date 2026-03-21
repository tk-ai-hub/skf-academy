import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

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
    email_confirm: false,
  })

  if (authError) {
    console.error('Auth signup error:', authError)
    return Response.json({ error: authError.message }, { status: 400 })
  }

  // Generate email confirmation link and send via Resend
  const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: 'signup',
    email,
    password,
  })

  if (!linkError && linkData?.properties?.action_link) {
    const confirmUrl = linkData.properties.action_link
    const name = [firstName, lastName].filter(Boolean).join(' ') || email
    await resend.emails.send({
      from: 'SKF Academy <noreply@kungfubc.com>',
      to: email,
      subject: 'Confirm your SKF Academy account',
      html: `
        <div style="font-family: Georgia, serif; max-width: 500px; margin: 0 auto; background: #1a1a1a; color: #fff; padding: 2rem; border-radius: 8px;">
          <div style="text-align: center; margin-bottom: 2rem;">
            <h1 style="color: #cc0000; letter-spacing: 3px; text-transform: uppercase; font-size: 1.5rem;">SKF Academy</h1>
            <p style="color: #666; font-size: 0.8rem; letter-spacing: 2px; text-transform: uppercase;">Shaolin Kung Fu — Est. 1986</p>
          </div>
          <h2 style="color: #fff;">Welcome, ${name}!</h2>
          <p style="color: #ccc;">Thanks for creating your account. Click the button below to confirm your email address and get started.</p>
          <div style="text-align: center; margin: 2rem 0;">
            <a href="${confirmUrl}" style="display: inline-block; background: #cc0000; color: #fff; text-decoration: none; padding: 0.9rem 2rem; border-radius: 4px; font-size: 1rem; letter-spacing: 1px; text-transform: uppercase;">Confirm Email</a>
          </div>
          <p style="color: #666; font-size: 0.85rem;">If you didn't create this account, you can safely ignore this email.</p>
          <hr style="border-color: #333; margin: 2rem 0;" />
          <p style="color: #444; font-size: 0.8rem; text-align: center;">SKF Academy · app.kungfubc.com</p>
        </div>
      `
    })
  } else if (linkError) {
    console.error('Generate link error:', linkError)
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
