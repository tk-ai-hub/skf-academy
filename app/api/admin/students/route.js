import { createClient } from '@supabase/supabase-js'

export async function GET() {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, full_name, first_name, last_name, email, phone, belt_rank, date_of_birth, role')
    .or('role.neq.admin,role.is.null')
    .order('first_name', { ascending: true })

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data)
}
