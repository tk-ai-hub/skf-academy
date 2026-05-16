import { createClient } from '@supabase/supabase-js'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

export async function GET() {
  const { data, error } = await sb
    .from('library_items')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data || [])
}

export async function POST(request) {
  const body = await request.json()
  const { title, description, type, fileUrl, fileName, category } = body
  if (!title || !type || !fileUrl) return Response.json({ error: 'title, type, fileUrl required' }, { status: 400 })

  const { data: tenant } = await sb.from('tenants').select('id').eq('slug', 'skf-academy').single()
  const { data, error } = await sb.from('library_items').insert({
    tenant_id: tenant?.id,
    title,
    description: description || '',
    type,
    file_url: fileUrl,
    file_name: fileName || '',
    category: category || '',
  }).select().single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data)
}

export async function DELETE(request) {
  const url = new URL(request.url)
  const id = url.searchParams.get('id')
  if (!id) return Response.json({ error: 'id required' }, { status: 400 })

  // Get the item to delete its storage file too
  const { data: item } = await sb.from('library_items').select('file_url, type').eq('id', id).single()

  // Delete from storage if it's a stored file (not an external URL)
  if (item?.file_url?.includes('/storage/v1/object/public/library/')) {
    const path = item.file_url.split('/storage/v1/object/public/library/')[1]
    await sb.storage.from('library').remove([decodeURIComponent(path)])
  }

  await sb.from('library_items').delete().eq('id', id)
  return Response.json({ success: true })
}
