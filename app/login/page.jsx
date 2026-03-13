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
    <main style={{ padding: '2rem', maxWidth: '400px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <h1>SKF Academy</h1>
      <h2>{isSignUp ? 'Create Account' : 'Sign In'}</h2>

      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        style={{ display: 'block', width: '100%', padding: '0.5rem', marginBottom: '1rem' }}
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        style={{ display: 'block', width: '100%', padding: '0.5rem', marginBottom: '1rem' }}
      />

      <button
        onClick={handleSubmit}
        disabled={loading}
        style={{ width: '100%', padding: '0.75rem', background: '#000', color: '#fff', border: 'none', cursor: 'pointer' }}
      >
        {loading ? 'Please wait...' : isSignUp ? 'Create Account' : 'Sign In'}
      </button>

      <p style={{ marginTop: '1rem', cursor: 'pointer', textDecoration: 'underline' }}
        onClick={() => setIsSignUp(!isSignUp)}>
        {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
      </p>

      {message && <p style={{ marginTop: '1rem', color: 'green' }}>{message}</p>}
    </main>
  )
}