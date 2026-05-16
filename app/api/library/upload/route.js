import { createClient } from '@supabase/supabase-js'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const BUCKET = 'library'

async function ensureBucket() {
  const { data: buckets } = await sb.storage.listBuckets()
  const exists = (buckets || []).some(b => b.name === BUCKET)
  if (!exists) {
    await sb.storage.createBucket(BUCKET, { public: true, allowedMimeTypes: ['application/pdf', 'video/*'], fileSizeLimit: '50mb' })
  }
}

export async function POST(request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file')
    if (!file || typeof file === 'string') {
      return Response.json({ error: 'No file provided' }, { status: 400 })
    }

    await ensureBucket()

    const ext = file.name.split('.').pop().toLowerCase()
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}-${safeName}`

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    const { error: upErr } = await sb.storage
      .from(BUCKET)
      .upload(path, buffer, {
        contentType: file.type || (ext === 'pdf' ? 'application/pdf' : 'video/mp4'),
        upsert: false,
      })

    if (upErr) return Response.json({ error: 'Storage upload failed: ' + upErr.message }, { status: 500 })

    const { data: { publicUrl } } = sb.storage.from(BUCKET).getPublicUrl(path)

    return Response.json({ url: publicUrl, fileName: file.name, path })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
