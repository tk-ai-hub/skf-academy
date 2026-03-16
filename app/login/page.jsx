'use client'

import { useState, useEffect } from 'react'
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
  const [installPrompt, setInstallPrompt] = useState(null)
  const [showInstallBanner, setShowInstallBanner] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)

  useEffect(() => {
    const ios = /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase())
    const standalone = window.matchMedia('(display-mode: standalone)').matches
    setIsIOS(ios)
    setIsStandalone(standalone)

    if (!standalone) {
      if (ios) {
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

      if (data.user) {
        const { data: tenantData } = await supabase
          .from('tenants')
          .select('id')
          .eq('slug', 'skf-academy')
          .single()

        await supabase.from('users').insert({
          id: data.user.id,
          tenant_id: tenantData.id,
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

      {showInstallBanner && (
        <div style={{ background: '#2a2a2a', border: '1px solid #cc0000', borderRadius: '8px', padding: '1rem 1.5rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <p style={{ margin: 0, color: '#fff', fontWeight: 'bold', fontSize: '0.9rem' }}>📲 Install SKF Academy</p>
            <button onClick={() => setShowInstallBanner(false)}
              style={{ background: 'transparent', color: '#666', border: 'none', cursor: 'pointer', fontSize: '1rem', padding: 0 }}>✕</button>
          </div>

          {isIOS ? (
            <div style={{ marginTop: '0.75rem' }}>
              <p style={{ margin: '0 0 0.5rem', color: '#999', fontSize: '0.85rem' }}>Add this app to your home screen:</p>
              <p style={{ margin: '0.25rem 0', color: '#ccc', fontSize: '0.85rem' }}>1. Tap the <strong style={{ color: '#fff' }}>Share</strong> button at the bottom of Safari ⬆️</p>
              <p style={{ margin: '0.25rem 0', color: '#ccc', fontSize: '0.85rem' }}>2. Scroll down and tap <strong style={{ color: '#fff' }}>"Add to Home Screen"</strong></p>
              <p style={{ margin: '0.25rem 0', color: '#ccc', fontSize: '0.85rem' }}>3. Tap <strong style={{ color: '#fff' }}>"Add"</strong> in the top right</p>
            </div>
          ) : (
            <div style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ margin: 0, color: '#999', fontSize: '0.85rem' }}>Add to your home screen for quick access</p>
              <button onClick={handleInstall}
                style={{ padding: '0.4rem 0.9rem', background: '#cc0000', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem', marginLeft: '1rem' }}>
                Install
              </button>
            </div>
          )}
        </div>
      )}

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
