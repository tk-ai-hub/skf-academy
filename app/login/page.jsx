'use client'

import { useState } from 'react'
import { supabase } from '../supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [dob, setDob] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    setLoading(true)
    setMessage('')

    if (isSignUp) {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) {
        setMessage(error.message)
        setLoading(false)
        return
      }

      // Save profile to users table
      if (data.user) {
        await supabase.from('users').insert({
          id: data.user.id,
          tenant_id: (await supabase.from('tenants').select('id').eq('slug', 'skf-academy').single()).data.id,
          email,
          first_name: firstName,
          last_name: lastName,
          phone,
          date_of_birth: dob || null,
          role: 'student'
        })
      }

      window.location.href = '/confirm'
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setMessage(error.message)
      else window.location.href = '/dashboard'
    }
    setLoading(false)
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

  const fieldStyle = { marginBottom: '1rem' }

  return (
    <main style={{ maxWidth: '400px', margin: '4rem auto' }}>
      <h2 style={{ color: '#fff', textAlign: 'center', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
        {isSignUp ? 'Create Account' : 'Sign In'}
      </h2>
      <p style={{ color: '#666', textAlign: 'center', marginBottom: '2rem', fontSize: '0.9rem' }}>
        {isSignUp ? 'Join SKF Academy' : 'Welcome back'}
      </p>

      <div style={{ background: '#2a2a2a', border: '1px solid #333', borderRadius: '8px', padding: '2rem' }}>

        {isSignUp && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={labelStyle}>First Name</label>
                <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Last Name</label>
                <input type="text" value={lastName} onChange={e => setLastName(e.target.value)} style={inputStyle} />
              </div>
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>Phone Number</label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} style={inputStyle} />
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>Date of Birth</label>
              <input type="date" value={dob} onChange={e => setDob(e.target.value)} style={{ ...inputStyle, colorScheme: 'dark' }} />
            </div>
          </>
        )}

        <div style={fieldStyle}>
          <label style={labelStyle}>Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} />
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <label style={labelStyle}>Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} style={inputStyle} />
        </div>

        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{ width: '100%', padding: '0.85rem', background: '#cc0000', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold', letterSpacing: '1px', textTransform: 'uppercase' }}
        >
          {loading ? 'Please wait...' : isSignUp ? 'Create Account' : 'Sign In'}
        </button>

        {message && (
          <p style={{ marginTop: '1rem', color: '#ff6666', textAlign: 'center', fontSize: '0.9rem' }}>
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