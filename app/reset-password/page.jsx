'use client'
import { useState } from 'react'
import { supabase } from '../supabase'

export default function ResetPassword() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function handleReset() {
    if (!password) { setMessage('Please enter a new password.'); return }
    if (password.length < 6) { setMessage('Password must be at least 6 characters.'); return }
    if (password !== confirm) { setMessage('Passwords do not match.'); return }
    setLoading(true)
    setMessage('')
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) { setMessage(error.message); return }
    setDone(true)
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
    <main style={{ maxWidth: '400px', margin: '4rem auto', padding: '0 1rem' }}>
      <h2 style={{ color: '#fff', textAlign: 'center', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
        New Password
      </h2>
      <p style={{ color: '#666', textAlign: 'center', marginBottom: '2rem', fontSize: '0.9rem' }}>
        Choose a new password for your account
      </p>

      <div style={{ background: '#2a2a2a', border: '1px solid #333', borderRadius: '8px', padding: '2rem' }}>
        {done ? (
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: '#66cc66', fontSize: '1rem', marginBottom: '1.5rem' }}>✅ Password updated successfully!</p>
            <a href="/dashboard" style={{ display: 'block', padding: '0.85rem', background: '#cc0000', color: '#fff', borderRadius: '6px', textDecoration: 'none', fontWeight: 'bold', letterSpacing: '1px', textTransform: 'uppercase', fontSize: '1rem' }}>
              Go to Dashboard
            </a>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: '1rem' }}>
              <label style={labelStyle}>New Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} style={inputStyle} autoFocus />
            </div>
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={labelStyle}>Confirm Password</label>
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} style={inputStyle} onKeyDown={e => e.key === 'Enter' && handleReset()} />
            </div>
            <button
              onClick={handleReset}
              disabled={loading}
              style={{ width: '100%', padding: '0.85rem', background: '#cc0000', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold', letterSpacing: '1px', textTransform: 'uppercase' }}
            >
              {loading ? 'Saving...' : 'Set New Password'}
            </button>
            {message && <p style={{ marginTop: '1rem', color: '#ff6666', textAlign: 'center', fontSize: '0.9rem' }}>{message}</p>}
          </>
        )}
      </div>
    </main>
  )
}
