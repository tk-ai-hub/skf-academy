'use client'

import { useState } from 'react'
import { supabase } from '../supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    setLoading(true)
    setMessage('')

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) setMessage(error.message)
      else setMessage('Check your email to confirm your account!')
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setMessage(error.message)
      else window.location.href = '/dashboard'
    }
    setLoading(false)
  }

  return (
    <main style={{ maxWidth: '400px', margin: '4rem auto' }}>
      <h2 style={{ color: '#fff', textAlign: 'center', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
        {isSignUp ? 'Create Account' : 'Sign In'}
      </h2>
      <p style={{ color: '#666', textAlign: 'center', marginBottom: '2rem', fontSize: '0.9rem' }}>
        {isSignUp ? 'Join SKF Academy' : 'Welcome back'}
      </p>

      <div style={{ background: '#2a2a2a', border: '1px solid #333', borderRadius: '8px', padding: '2rem' }}>
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', color: '#999', fontSize: '0.8rem', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            style={{ width: '100%', padding: '0.75rem', background: '#1a1a1a', border: '1px solid #444', borderRadius: '4px', color: '#fff', fontSize: '1rem', boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', color: '#999', fontSize: '0.8rem', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Password</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            style={{ width: '100%', padding: '0.75rem', background: '#1a1a1a', border: '1px solid #444', borderRadius: '4px', color: '#fff', fontSize: '1rem', boxSizing: 'border-box' }}
          />
        </div>

        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{ width: '100%', padding: '0.85rem', background: '#cc0000', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold', letterSpacing: '1px', textTransform: 'uppercase' }}
        >
          {loading ? 'Please wait...' : isSignUp ? 'Create Account' : 'Sign In'}
        </button>

        {message && (
          <p style={{ marginTop: '1rem', color: message.includes('error') || message.includes('Error') ? '#ff6666' : '#66cc66', textAlign: 'center', fontSize: '0.9rem' }}>
            {message}
          </p>
        )}

        <p
          onClick={() => setIsSignUp(!isSignUp)}
          style={{ marginTop: '1.5rem', textAlign: 'center', color: '#cc0000', cursor: 'pointer', fontSize: '0.9rem' }}
        >
          {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
        </p>
      </div>
    </main>
  )
}