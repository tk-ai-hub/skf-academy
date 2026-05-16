'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../supabase'

const CATEGORIES = ['Techniques', 'Forms', 'Weapons', 'Conditioning', 'Theory', 'Other']

function youtubeEmbedUrl(url) {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?/]+)/)
  return m ? `https://www.youtube.com/embed/${m[1]}` : null
}

function vimeoEmbedUrl(url) {
  const m = url.match(/vimeo\.com\/(\d+)/)
  return m ? `https://player.vimeo.com/video/${m[1]}` : null
}

function isExternalVideo(url) {
  return youtubeEmbedUrl(url) || vimeoEmbedUrl(url)
}

export default function AdminLibrary() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  // Form state
  const [type, setType] = useState('pdf')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [file, setFile] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef(null)

  useEffect(() => {
    checkAdminAndLoad()
  }, [])

  async function checkAdminAndLoad() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { window.location.href = '/login'; return }
    const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') { window.location.href = '/dashboard'; return }
    loadItems()
  }

  async function loadItems() {
    setLoading(true)
    const res = await fetch('/api/library')
    const data = await res.json()
    setItems(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  function resetForm() {
    setTitle(''); setDescription(''); setCategory(''); setVideoUrl(''); setFile(null)
    setType('pdf'); setError(''); if (fileRef.current) fileRef.current.value = ''
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(''); setSuccess('')
    if (!title.trim()) { setError('Title is required'); return }

    let fileUrl = '', fileName = '', resolvedType = type

    if (type === 'pdf' || type === 'video-file') {
      if (!file) { setError('Please select a file'); return }
      setUploading(true)
      const ext = file.name.split('.').pop()
      const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { data: upData, error: upErr } = await supabase.storage.from('library').upload(path, file, { upsert: false })
      if (upErr) { setError('Upload failed: ' + upErr.message); setUploading(false); return }
      const { data: { publicUrl } } = supabase.storage.from('library').getPublicUrl(path)
      fileUrl = publicUrl
      fileName = file.name
      resolvedType = type === 'pdf' ? 'pdf' : 'video'
    } else {
      if (!videoUrl.trim()) { setError('Please enter a video URL'); return }
      fileUrl = videoUrl.trim()
      resolvedType = 'video'
    }

    setUploading(true)
    const res = await fetch('/api/library', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title.trim(), description: description.trim(), type: resolvedType, fileUrl, fileName, category })
    })
    const saved = await res.json()
    setUploading(false)
    if (!res.ok) { setError(saved.error || 'Failed to save'); return }
    setSuccess('Added successfully!')
    setTimeout(() => setSuccess(''), 3000)
    resetForm()
    loadItems()
  }

  async function handleDelete(item) {
    await fetch(`/api/library?id=${item.id}`, { method: 'DELETE' })
    setItems(prev => prev.filter(i => i.id !== item.id))
    setDeleteConfirm(null)
  }

  const pdfs = items.filter(i => i.type === 'pdf')
  const videos = items.filter(i => i.type === 'video')

  const inputStyle = { width: '100%', padding: '0.65rem 0.75rem', background: '#1a1a1a', border: '1px solid #333', borderRadius: '6px', color: '#fff', fontSize: '0.9rem', boxSizing: 'border-box' }
  const labelStyle = { display: 'block', color: '#777', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.4rem' }

  return (
    <main style={{ maxWidth: '900px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <a href="/admin" style={{ color: '#666', textDecoration: 'none', fontSize: '0.9rem' }}>← Admin</a>
        <div>
          <h1 style={{ color: '#fff', margin: 0, fontSize: '1.5rem', letterSpacing: '2px', textTransform: 'uppercase' }}>Library</h1>
          <p style={{ color: '#555', margin: '0.2rem 0 0', fontSize: '0.85rem' }}>Upload PDFs and video tutorials for students</p>
        </div>
      </div>

      {/* Upload Form */}
      <div style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: '10px', padding: '1.5rem', marginBottom: '2rem' }}>
        <h2 style={{ color: '#fff', margin: '0 0 1.25rem', fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Add New Item</h2>

        {/* Type selector */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
          {[{ v: 'pdf', l: '📄 PDF' }, { v: 'video-url', l: '▶ YouTube / Vimeo' }, { v: 'video-file', l: '🎬 Video File' }].map(({ v, l }) => (
            <button key={v} onClick={() => setType(v)} style={{ flex: 1, padding: '0.55rem', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 'bold', background: type === v ? '#cc0000' : '#2a2a2a', color: '#fff' }}>
              {l}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div>
              <label style={labelStyle}>Title *</label>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Basic Stances Guide" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Category</label>
              <select value={category} onChange={e => setCategory(e.target.value)} style={{ ...inputStyle, colorScheme: 'dark' }}>
                <option value="">— None —</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div style={{ marginBottom: '0.75rem' }}>
            <label style={labelStyle}>Description (optional)</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="Brief description of what this covers…" style={{ ...inputStyle, resize: 'vertical' }} />
          </div>

          {type === 'video-url' ? (
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={labelStyle}>YouTube or Vimeo URL</label>
              <input value={videoUrl} onChange={e => setVideoUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=..." style={inputStyle} />
            </div>
          ) : (
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={labelStyle}>{type === 'pdf' ? 'PDF File' : 'Video File'}</label>
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) setFile(f) }}
                onClick={() => fileRef.current?.click()}
                style={{ border: `2px dashed ${dragOver ? '#cc0000' : '#333'}`, borderRadius: '8px', padding: '1.5rem', textAlign: 'center', cursor: 'pointer', background: dragOver ? '#1a0000' : 'transparent', transition: 'all 0.2s' }}
              >
                {file ? (
                  <div>
                    <div style={{ color: '#fff', fontWeight: 'bold', fontSize: '0.9rem' }}>{file.name}</div>
                    <div style={{ color: '#666', fontSize: '0.8rem', marginTop: '0.25rem' }}>{(file.size / 1024 / 1024).toFixed(1)} MB</div>
                  </div>
                ) : (
                  <div>
                    <div style={{ color: '#555', fontSize: '2rem', marginBottom: '0.5rem' }}>{type === 'pdf' ? '📄' : '🎬'}</div>
                    <div style={{ color: '#666', fontSize: '0.85rem' }}>Drop file here or <span style={{ color: '#cc0000' }}>click to browse</span></div>
                    <div style={{ color: '#444', fontSize: '0.75rem', marginTop: '0.25rem' }}>{type === 'pdf' ? 'PDF files' : 'MP4, MOV, WebM'}</div>
                  </div>
                )}
                <input ref={fileRef} type="file" accept={type === 'pdf' ? '.pdf' : 'video/*'} style={{ display: 'none' }} onChange={e => setFile(e.target.files[0] || null)} />
              </div>
            </div>
          )}

          {error && <p style={{ color: '#ff6666', fontSize: '0.85rem', margin: '0 0 0.75rem' }}>{error}</p>}
          {success && <p style={{ color: '#66cc66', fontSize: '0.85rem', margin: '0 0 0.75rem' }}>{success}</p>}

          <button type="submit" disabled={uploading} style={{ width: '100%', padding: '0.8rem', background: uploading ? '#333' : '#cc0000', color: uploading ? '#666' : '#fff', border: 'none', borderRadius: '6px', cursor: uploading ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '0.95rem', letterSpacing: '1px' }}>
            {uploading ? 'Uploading…' : 'Add to Library'}
          </button>
        </form>
      </div>

      {/* Existing Items */}
      {loading ? (
        <p style={{ color: '#555' }}>Loading library…</p>
      ) : (
        <>
          {/* PDFs */}
          {pdfs.length > 0 && (
            <section style={{ marginBottom: '2rem' }}>
              <h2 style={{ color: '#cc0000', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '0.75rem' }}>📄 PDFs ({pdfs.length})</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {pdfs.map(item => (
                  <LibraryRow key={item.id} item={item} onDelete={() => setDeleteConfirm(item)} />
                ))}
              </div>
            </section>
          )}

          {/* Videos */}
          {videos.length > 0 && (
            <section style={{ marginBottom: '2rem' }}>
              <h2 style={{ color: '#cc0000', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '0.75rem' }}>▶ Videos ({videos.length})</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {videos.map(item => (
                  <LibraryRow key={item.id} item={item} onDelete={() => setDeleteConfirm(item)} />
                ))}
              </div>
            </section>
          )}

          {items.length === 0 && (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#444', border: '1px dashed #2a2a2a', borderRadius: '10px' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📚</div>
              <div>No items yet. Add your first PDF or video above.</div>
            </div>
          )}
        </>
      )}

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: '#1a1a1a', border: '1px solid #cc0000', borderRadius: '10px', padding: '1.5rem', maxWidth: '360px', width: '100%' }}>
            <h3 style={{ color: '#fff', margin: '0 0 0.5rem' }}>Delete Item?</h3>
            <p style={{ color: '#999', fontSize: '0.9rem', margin: '0 0 1.25rem' }}>"{deleteConfirm.title}" will be permanently removed.</p>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={() => setDeleteConfirm(null)} style={{ flex: 1, padding: '0.7rem', background: 'transparent', border: '1px solid #333', borderRadius: '6px', color: '#888', cursor: 'pointer' }}>Cancel</button>
              <button onClick={() => handleDelete(deleteConfirm)} style={{ flex: 1, padding: '0.7rem', background: '#cc0000', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

function LibraryRow({ item, onDelete }) {
  const date = new Date(item.created_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
  return (
    <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '8px', padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
      <div style={{ fontSize: '1.4rem', flexShrink: 0 }}>{item.type === 'pdf' ? '📄' : '▶'}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: '#fff', fontWeight: 'bold', fontSize: '0.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</div>
        <div style={{ color: '#555', fontSize: '0.78rem', marginTop: '0.15rem' }}>
          {item.category && <span style={{ color: '#cc0000', marginRight: '0.5rem' }}>{item.category}</span>}
          {date}
          {item.description && <span style={{ marginLeft: '0.5rem' }}>· {item.description}</span>}
        </div>
      </div>
      <a href={item.file_url} target="_blank" rel="noopener noreferrer" style={{ padding: '0.35rem 0.75rem', background: '#2a2a2a', color: '#aaa', textDecoration: 'none', borderRadius: '5px', fontSize: '0.8rem', flexShrink: 0 }}>
        View
      </a>
      <button onClick={onDelete} style={{ padding: '0.35rem 0.75rem', background: 'transparent', color: '#884444', border: '1px solid #442222', borderRadius: '5px', cursor: 'pointer', fontSize: '0.8rem', flexShrink: 0 }}>
        Delete
      </button>
    </div>
  )
}
