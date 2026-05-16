'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

function youtubeEmbedUrl(url) {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?/]+)/)
  return m ? `https://www.youtube.com/embed/${m[1]}` : null
}

function vimeoEmbedUrl(url) {
  const m = url.match(/vimeo\.com\/(\d+)/)
  return m ? `https://player.vimeo.com/video/${m[1]}` : null
}

function getEmbedUrl(url) {
  return youtubeEmbedUrl(url) || vimeoEmbedUrl(url) || null
}

export default function Library() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [activeVideo, setActiveVideo] = useState(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/login'; return }
      const res = await fetch('/api/library')
      const data = await res.json()
      setItems(Array.isArray(data) ? data : [])
      setLoading(false)
    }
    load()
  }, [])

  const categories = ['all', ...Array.from(new Set(items.map(i => i.category).filter(Boolean)))]
  const filtered = filter === 'all' ? items : items.filter(i => i.category === filter)
  const pdfs = filtered.filter(i => i.type === 'pdf')
  const videos = filtered.filter(i => i.type === 'video')

  return (
    <main>
      <div style={{ marginBottom: '1.5rem' }}>
        <a href="/dashboard" style={{ color: '#666', textDecoration: 'none', fontSize: '0.85rem' }}>← Dashboard</a>
        <h1 style={{ color: '#fff', margin: '0.5rem 0 0.25rem', fontSize: '1.5rem', letterSpacing: '2px', textTransform: 'uppercase' }}>Library</h1>
        <p style={{ color: '#555', margin: 0, fontSize: '0.85rem' }}>Training resources, tutorials and reference materials</p>
      </div>

      {/* Category filter */}
      {categories.length > 1 && (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
          {categories.map(c => (
            <button
              key={c}
              onClick={() => setFilter(c)}
              style={{ padding: '0.4rem 1rem', borderRadius: '20px', border: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: filter === c ? 'bold' : 'normal', background: filter === c ? '#cc0000' : '#2a2a2a', color: '#fff', textTransform: c === 'all' ? 'none' : 'capitalize' }}
            >
              {c === 'all' ? 'All' : c}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <p style={{ color: '#555' }}>Loading library…</p>
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem 1rem', color: '#444' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📚</div>
          <p>No resources available yet. Check back soon.</p>
        </div>
      ) : (
        <>
          {/* Videos */}
          {videos.length > 0 && (
            <section style={{ marginBottom: '2.5rem' }}>
              <h2 style={{ color: '#cc0000', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '1rem' }}>▶ Videos</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                {videos.map(item => {
                  const embedUrl = getEmbedUrl(item.file_url)
                  const isActive = activeVideo === item.id
                  return (
                    <div key={item.id} style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '10px', overflow: 'hidden' }}>
                      {isActive && embedUrl ? (
                        <div style={{ position: 'relative', paddingBottom: '56.25%', background: '#000' }}>
                          <iframe
                            src={embedUrl + '?autoplay=1'}
                            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                          />
                        </div>
                      ) : isActive && !embedUrl ? (
                        <div style={{ position: 'relative', paddingBottom: '56.25%', background: '#000' }}>
                          <video
                            src={item.file_url}
                            controls
                            autoPlay
                            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
                          />
                        </div>
                      ) : (
                        <div
                          onClick={() => setActiveVideo(item.id)}
                          style={{ paddingBottom: '56.25%', position: 'relative', background: '#0a0a0a', cursor: 'pointer' }}
                        >
                          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '0.5rem' }}>
                            <div style={{ width: '52px', height: '52px', background: '#cc0000', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <span style={{ color: '#fff', fontSize: '1.4rem', marginLeft: '4px' }}>▶</span>
                            </div>
                          </div>
                        </div>
                      )}
                      <div style={{ padding: '0.85rem 1rem' }}>
                        <div style={{ color: '#fff', fontWeight: 'bold', fontSize: '0.95rem', marginBottom: '0.25rem' }}>{item.title}</div>
                        {item.category && <span style={{ color: '#cc0000', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{item.category}</span>}
                        {item.description && <p style={{ color: '#666', fontSize: '0.8rem', margin: '0.35rem 0 0' }}>{item.description}</p>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* PDFs */}
          {pdfs.length > 0 && (
            <section style={{ marginBottom: '2rem' }}>
              <h2 style={{ color: '#cc0000', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '1rem' }}>📄 Documents</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {pdfs.map(item => (
                  <a
                    key={item.id}
                    href={item.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '8px', padding: '0.9rem 1.1rem', display: 'flex', alignItems: 'center', gap: '1rem', textDecoration: 'none', transition: 'border-color 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = '#cc0000'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = '#2a2a2a'}
                  >
                    <span style={{ fontSize: '1.6rem', flexShrink: 0 }}>📄</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: '#fff', fontWeight: 'bold', fontSize: '0.95rem' }}>{item.title}</div>
                      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.2rem' }}>
                        {item.category && <span style={{ color: '#cc0000', fontSize: '0.75rem', textTransform: 'uppercase' }}>{item.category}</span>}
                        {item.description && <span style={{ color: '#555', fontSize: '0.8rem' }}>{item.description}</span>}
                      </div>
                    </div>
                    <span style={{ color: '#555', fontSize: '0.8rem', flexShrink: 0 }}>Open →</span>
                  </a>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  )
}
