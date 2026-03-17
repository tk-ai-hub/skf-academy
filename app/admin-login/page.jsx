'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function AdminLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // If already logged in as admin, redirect straight to admin
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return
      const { data: profile } = await supabase
        .from('users')
        .select('role')
        .eq('id', data.user.id)
        .single()
      if (profile?.role === 'admin') {
        window.location.href = '/admin'
      }
    })
  }, [])

  async function handleLogin() {
    setLoading(true)
    setMessage('')

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setMessage('Invalid email or password.')
      setLoading(false)
      return
    }

    // Check role
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', data.user.id)
      .single()

    if (profile?.role !== 'admin') {
      await supabase.auth.signOut()
      setMessage('Access denied. Admin accounts only.')
      setLoading(false)
      return
    }

    window.location.href = '/admin'
  }

  const inputStyle = {
    width: '100%',
    padding: '0.75rem',
    background: '#1a1a1a',
    border: '1px solid #444',
    borderRadius: '4px',
    color: '#fff',
    fontSize: '1rem',
    boxSizing: 'border-box'
  }

  const labelStyle = {
    display: 'block',
    color: '#999',
    fontSize: '0.8rem',
    letterSpacing: '1px',
    textTransform: 'uppercase',
    marginBottom: '0.5rem'
  }

  return (
    <main style={{ maxWidth: '380px', margin: '6rem auto', padding: '0 1rem' }}>
      <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
        <div style={{ color: '#cc0000', fontSize: '0.75rem', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
          SKF Academy
        </div>
        <h1 style={{ color: '#fff', fontSize: '1.6rem', letterSpacing: '2px', textTransform: 'uppercase', margin: 0 }}>
          Admin Portal
        </h1>
        <p style={{ color: '#555', fontSize: '0.85rem', marginTop: '0.5rem' }}>Restricted access</p>
      </div>

      <div style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: '10px', padding: '2rem' }}>
        <div style={{ marginBottom: '1.25rem' }}>
          <label style={labelStyle}>Email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            style={inputStyle}
            placeholder="admin@email.com"
          />
        </div>

        <div style={{ marginBottom: '1.75rem' }}>
          <label style={labelStyle}>Password</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            style={inputStyle}
            placeholder="••••••••"
          />
        </div>

        <button
          onClick={handleLogin}
          disabled={loading}
          style={{
            width: '100%',
            padding: '0.85rem',
            background: loading ? '#661111' : '#cc0000',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '1rem',
            fontWeight: 'bold',
            letterSpacing: '1px',
            textTransform: 'uppercase',
            opacity: loading ? 0.7 : 1
          }}
        >
          {loading ? 'Verifying...' : 'Sign In'}
        </button>

        {message && (
          <p style={{ marginTop: '1rem', color: '#ff6666', textAlign: 'center', fontSize: '0.9rem' }}>
            {message}
          </p>
        )}
      </div>

      <p style={{ textAlign: 'center', marginTop: '1.5rem' }}>
        <a href="/login" style={{ color: '#555', fontSize: '0.85rem', textDecoration: 'none' }}>
          ← Student login
        </a>
      </p>
    </main>
  )
}
