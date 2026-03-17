'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function AdminLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [installPrompt, setInstallPrompt] = useState(null)
  const [showInstallBanner, setShowInstallBanner] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [isMac, setIsMac] = useState(false)

  useEffect(() => {
    const ua = window.navigator.userAgent.toLowerCase()
    const ios = /iphone|ipad|ipod/.test(ua)
    const mac = /macintosh/.test(ua) && /safari/.test(ua) && !/chrome/.test(ua)
    const standalone = window.matchMedia('(display-mode: standalone)').matches
    setIsIOS(ios)
    setIsMac(mac)
    if (!standalone) {
      if (ios || mac) {
        setShowInstallBanner(true)
      } else {
        window.addEventListener('beforeinstallprompt', (e) => {
          e.preventDefault()
          setInstallPrompt(e)
          setShowInstallBanner(true)
        })
      }
    }
  }, [])

  async function handleInstall() {
    if (!installPrompt) return
    installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === 'accepted') setShowInstallBanner(false)
  }

  async function handleLogin() {
    setLoading(true)
    setMessage('')
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setMessage('Invalid email or password.'); setLoading(false); return }
    const { data: profile } = await supabase.from('users').select('role').eq('id', data.user.id).single()
    if (profile?.role !== 'admin') {
      await supabase.auth.signOut()
      setMessage('Access denied. Admin accounts only.')
      setLoading(false)
      return
    }
    window.location.href = '/admin'
  }

  const inputStyle = {
    width: '100%', padding: '0.75rem', background: '#1a1a1a', border: '1px solid #444',
    borderRadius: '4px', color: '#fff', fontSize: '1rem', boxSizing: 'border-box'
  }
  const labelStyle = {
    display: 'block', color: '#999', fontSize: '0.8rem', letterSpacing: '1px',
    textTransform: 'uppercase', marginBottom: '0.5rem'
  }

  return (
    <main style={{ maxWidth: '380px', margin: '4rem auto', padding: '0 1rem' }}>
      {showInstallBanner && (
        <div style={{ background: '#2a2a2a', border: '1px solid #cc0000', borderRadius: '8px', padding: '1rem 1.5rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <p style={{ margin: 0, color: '#fff', fontWeight: 'bold', fontSize: '0.9rem' }}>Install SKF Admin App</p>
            <button onClick={() => setShowInstallBanner(false)} style={{ background: 'transparent', color: '#666', border: 'none', cursor: 'pointer', fontSize: '1rem', padding: 0 }}>✕</button>
          </div>
          {isIOS ? (
            <div style={{ marginTop: '0.75rem' }}>
              <p style={{ margin: '0 0 0.5rem', color: '#999', fontSize: '0.85rem' }}>Add to your home screen:</p>
              <p style={{ margin: '0.25rem 0', color: '#ccc', fontSize: '0.85rem' }}>1. Tap the Share button in Safari</p>
              <p style={{ margin: '0.25rem 0', color: '#ccc', fontSize: '0.85rem' }}>2. Tap "Add to Home Screen"</p>
              <p style={{ margin: '0.25rem 0', color: '#ccc', fontSize: '0.85rem' }}>3. Tap "Add"</p>
            </div>
          ) : isMac ? (
            <div style={{ marginTop: '0.75rem' }}>
              <p style={{ margin: '0 0 0.5rem', color: '#999', fontSize: '0.85rem' }}>Add to your Mac dock:</p>
              <p style={{ margin: '0.25rem 0', color: '#ccc', fontSize: '0.85rem' }}>1. Click Share in the Safari toolbar</p>
              <p style={{ margin: '0.25rem 0', color: '#ccc', fontSize: '0.85rem' }}>2. Click "Add to Dock"</p>
            </div>
          ) : (
            <div style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ margin: 0, color: '#999', fontSize: '0.85rem' }}>Install for quick access</p>
              <button onClick={handleInstall} style={{ padding: '0.4rem 0.9rem', background: '#cc0000', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem', marginLeft: '1rem' }}>Install</button>
            </div>
          )}
        </div>
      )}

      <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
        <div style={{ color: '#cc0000', fontSize: '0.75rem', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '0.5rem' }}>SKF Academy</div>
        <h1 style={{ color: '#fff', fontSize: '1.6rem', letterSpacing: '2px', textTransform: 'uppercase', margin: 0 }}>Admin Portal</h1>
        <p style={{ color: '#555', fontSize: '0.85rem', marginTop: '0.5rem' }}>Restricted access</p>
      </div>

      <div style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: '10px', padding: '2rem' }}>
        <div style={{ marginBottom: '1.25rem' }}>
          <label style={labelStyle}>Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogin()} style={inputStyle} placeholder="admin@email.com" />
        </div>
        <div style={{ marginBottom: '1.75rem' }}>
          <label style={labelStyle}>Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogin()} style={inputStyle} placeholder="••••••••" />
        </div>
        <button onClick={handleLogin} disabled={loading} style={{ width: '100%', padding: '0.85rem', background: loading ? '#661111' : '#cc0000', color: '#fff', border: 'none', borderRadius: '6px', cursor: loading ? 'not-allowed' : 'pointer', fontSize: '1rem', fontWeight: 'bold', letterSpacing: '1px', textTransform: 'uppercase', opacity: loading ? 0.7 : 1 }}>
          {loading ? 'Verifying...' : 'Sign In'}
        </button>
        {message && <p style={{ marginTop: '1rem', color: '#ff6666', textAlign: 'center', fontSize: '0.9rem' }}>{message}</p>}
      </div>

      <p style={{ textAlign: 'center', marginTop: '1.5rem' }}>
        <a href="/login" style={{ color: '#555', fontSize: '0.85rem', textDecoration: 'none' }}>← Student login</a>
      </p>
    </main>
  )
}
