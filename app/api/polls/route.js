import { createClient } from '@supabase/supabase-js'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    const { data: poll, error: pollErr } = await sb
      .from('polls')
      .select('*')
      .eq('active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (pollErr || !poll) return Response.json({ poll: null })

    const isAdmin = searchParams.get('admin') === 'true'

    const { data: votes } = await sb.from('poll_votes')
      .select(isAdmin ? 'option_id, student_id, created_at' : 'option_id')
      .eq('poll_id', poll.id)

    let myVote = null
    if (userId) {
      const { data: mv } = await sb.from('poll_votes').select('option_id').eq('poll_id', poll.id).eq('student_id', userId).maybeSingle()
      myVote = mv?.option_id || null
    }

    const counts = {}
    for (const v of (votes || [])) {
      counts[v.option_id] = (counts[v.option_id] || 0) + 1
    }

    let voters = null
    if (isAdmin && votes?.length > 0) {
      const studentIds = votes.map(v => v.student_id)
      const { data: students } = await sb.from('users').select('id, first_name, last_name, full_name, email').in('id', studentIds)
      const studentMap = {}
      for (const s of (students || [])) studentMap[s.id] = s
      voters = votes.map(v => ({
        optionId: v.option_id,
        studentId: v.student_id,
        votedAt: v.created_at,
        name: studentMap[v.student_id]
          ? [studentMap[v.student_id].first_name, studentMap[v.student_id].last_name].filter(Boolean).join(' ') || studentMap[v.student_id].full_name || studentMap[v.student_id].email
          : 'Unknown',
      }))
    }

    return Response.json({ poll, votes: counts, total: (votes || []).length, myVote, voters })
  } catch {
    return Response.json({ poll: null })
  }
}

export async function POST(request) {
  const { question, options } = await request.json()
  // Close any existing active polls first
  await sb.from('polls').update({ active: false }).eq('active', true)
  const { data, error } = await sb.from('polls').insert({ question, options }).select().single()
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ poll: data })
}

export async function DELETE(request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  await sb.from('polls').update({ active: false }).eq('id', id)
  return Response.json({ success: true })
}
