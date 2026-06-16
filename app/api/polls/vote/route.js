import { createClient } from '@supabase/supabase-js'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

export async function POST(request) {
  try {
    const { pollId, optionId, userId } = await request.json()
    if (!pollId || !optionId || !userId) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const { error } = await sb.from('poll_votes').upsert(
      { poll_id: pollId, student_id: userId, option_id: optionId },
      { onConflict: 'poll_id,student_id' }
    )

    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ success: true })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
