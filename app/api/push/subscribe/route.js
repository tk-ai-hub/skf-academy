import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function POST(request) {
  const { userId, subscription } = await request.json()
  if (!userId || !subscription?.endpoint) {
    return Response.json({ error: 'Missing userId or subscription' }, { status: 400 })
  }

  const { error } = await supabase.from('push_subscriptions').upsert({
    user_id: userId,
    endpoint: subscription.endpoint,
    subscription,
  }, { onConflict: 'endpoint' })

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ success: true })
}

export async function DELETE(request) {
  const { userId, endpoint } = await request.json()
  if (!userId) return Response.json({ error: 'Missing userId' }, { status: 400 })

  const query = supabase.from('push_subscriptions').delete().eq('user_id', userId)
  if (endpoint) query.eq('endpoint', endpoint)

  await query
  return Response.json({ success: true })
}
