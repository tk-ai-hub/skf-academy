'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

// view: 'home' | 'signin' | 'signup' | 'trial' | 'forgot'
export default function Login() {
  const [view, setView] = useState('home')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [dob, setDob] = useState('')
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

  function reset(nextView) {
    setEmail(''); setPassword(''); setFirstName(''); setLastName('')
    setPhone(''); setDob(''); setMessage('')
    setView(nextView)
  }

  async function handleSignIn() {
    if (!email || !password) { setMessage('Please enter your email and password.'); return }
    setLoading(true); setMessage('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) setMessage(error.message)
    else window.location.href = '/dashboard'
  }

  async function handleSignUp() {
    if (!firstName || !email || !password) { setMessage('First name, email and password are required.'); return }
    setLoading(true); setMessage('')
    const res = await fetch('/api/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, firstName, lastName, phone, dob: dob || null })
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { setMessage(data.error || 'Signup failed. Please try again.'); return }
    window.location.href = '/confirm'
  }

  async function handleTrial() {
    if (!firstName || !email || !password) { setMessage('First name, email and password are required.'); return }
    setLoading(true); setMessage('')
    const res = await fetch('/api/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, firstName, lastName, phone, dob: dob || null, trialToken: true })
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { setMessage(data.error || 'Signup failed. Please try again.'); return }
    window.location.href = '/confirm'
  }

  async function handleForgotPassword() {
    if (!email) { setMessage('Please enter your email address.'); return }
    setLoading(true); setMessage('')
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?type=recovery`
    })
    setLoading(false)
    if (error) { setMessage(error.message); return }
    setMessage('✅ Check your email for a password reset link.')
  }

  const inputStyle = {
    width: '100%', padding: '0.75rem', background: '#1a1a1a',
    border: '1px solid #444', borderRadius: '4px', color: '#fff',
    fontSize: '1rem', boxSizing: 'border-box'
  }
  const labelStyle = {
    display: 'block', color: '#999', fontSize: '0.8rem',
    letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '0.5rem'
  }
  const fieldStyle = { marginBottom: '1rem' }

  return (
    <main style={{ maxWidth: '420px', margin: '3rem auto', padding: '0 1rem' }}>

      {/* PWA install banner */}
      {showInstallBanner && (
        <div style={{ background: '#2a2a2a', border: '1px solid #cc0000', borderRadius: '8px', padding: '1rem 1.5rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <p style={{ margin: 0, color: '#fff', fontWeight: 'bold', fontSize: '0.9rem' }}>Install SKF Academy</p>
            <button onClick={() => setShowInstallBanner(false)} style={{ background: 'transparent', color: '#666', border: 'none', cursor: 'pointer', fontSize: '1rem', padding: 0 }}>×</button>
          </div>
          {isIOS ? (
            <div style={{ marginTop: '0.75rem' }}>
              <p style={{ margin: '0 0 0.5rem', color: '#999', fontSize: '0.85rem' }}>Add this app to your home screen:</p>
              <p style={{ margin: '0.25rem 0', color: '#ccc', fontSize: '0.85rem' }}>1. Tap the <strong style={{ color: '#fff' }}>Share</strong> button at the bottom of Safari</p>
              <p style={{ margin: '0.25rem 0', color: '#ccc', fontSize: '0.85rem' }}>2. Tap <strong style={{ color: '#fff' }}>"Add to Home Screen"</strong></p>
            </div>
          ) : isMac ? (
            <div style={{ marginTop: '0.75rem' }}>
              <p style={{ margin: '0 0 0.5rem', color: '#999', fontSize: '0.85rem' }}>Add this app to your Mac dock:</p>
              <p style={{ margin: '0.25rem 0', color: '#ccc', fontSize: '0.85rem' }}>1. Click <strong style={{ color: '#fff' }}>Share</strong> in the Safari toolbar</p>
              <p style={{ margin: '0.25rem 0', color: '#ccc', fontSize: '0.85rem' }}>2. Click <strong style={{ color: '#fff' }}>"Add to Dock"</strong></p>
            </div>
          ) : (
            <div style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ margin: 0, color: '#999', fontSize: '0.85rem' }}>Add to your home screen for quick access</p>
              <button onClick={handleInstall} style={{ padding: '0.4rem 0.9rem', background: '#cc0000', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem', marginLeft: '1rem' }}>Install</button>
            </div>
          )}
        </div>
      )}

      {/* Branding */}
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h1 style={{ color: '#cc0000', letterSpacing: '3px', textTransform: 'uppercase', fontSize: '1.8rem', margin: '0 0 0.25rem' }}>SKF Academy</h1>
        <p style={{ color: '#555', fontSize: '0.8rem', letterSpacing: '2px', textTransform: 'uppercase', margin: 0 }}>Shaolin Kung Fu — Est. 1986</p>
      </div>

      {/* ── HOME ── */}
      {view === 'home' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Free Trial */}
          <button
            onClick={() => reset('trial')}
            style={{ width: '100%', padding: '1.2rem', background: '#cc0000', color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '1.15rem', fontWeight: 'bold', letterSpacing: '1px', textTransform: 'uppercase', boxShadow: '0 4px 20px rgba(204,0,0,0.4)' }}
          >
            Free Trial Lesson / Meeting
          </button>
          <p style={{ color: '#888', textAlign: 'center', fontSize: '0.85rem', margin: '-0.25rem 0 0.25rem' }}>
            No commitment — get 1 free token to book your first lesson
          </p>

          {/* Sign Up */}
          <button
            onClick={() => reset('signup')}
            style={{ width: '100%', padding: '1rem', background: 'transparent', color: '#fff', border: '2px solid #fff', borderRadius: '10px', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold', letterSpacing: '1px', textTransform: 'uppercase' }}
          >
            Create Account
          </button>

          {/* Sign In */}
          <p
            onClick={() => reset('signin')}
            style={{ textAlign: 'center', color: '#666', cursor: 'pointer', fontSize: '0.9rem', margin: '0.5rem 0 0' }}
          >
            Already have an account? <span style={{ color: '#cc0000' }}>Sign in</span>
          </p>
        </div>
      )}

      {/* ── SIGN IN ── */}
      {view === 'signin' && (
        <div style={{ background: '#2a2a2a', border: '1px solid #333', borderRadius: '8px', padding: '2rem' }}>
          <h2 style={{ color: '#fff', textAlign: 'center', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '1.5rem', fontSize: '1.1rem' }}>Sign In</h2>
          <div style={fieldStyle}>
            <label style={labelStyle}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} autoFocus />
          </div>
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={labelStyle}>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSignIn()} style={inputStyle} />
          </div>
          <button onClick={handleSignIn} disabled={loading} style={{ width: '100%', padding: '0.85rem', background: '#cc0000', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold', letterSpacing: '1px', textTransform: 'uppercase' }}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
          {message && <p style={{ marginTop: '1rem', color: '#ff6666', textAlign: 'center', fontSize: '0.9rem' }}>{message}</p>}
          <p onClick={() => reset('forgot')} style={{ marginTop: '1rem', textAlign: 'center', color: '#666', cursor: 'pointer', fontSize: '0.85rem' }}>Forgot password?</p>
          <p onClick={() => reset('home')} style={{ marginTop: '0.5rem', textAlign: 'center', color: '#cc0000', cursor: 'pointer', fontSize: '0.85rem' }}>← Back</p>
        </div>
      )}

      {/* ── SIGN UP ── */}
      {view === 'signup' && (
        <div style={{ background: '#2a2a2a', border: '1px solid #333', borderRadius: '8px', padding: '2rem' }}>
          <h2 style={{ color: '#fff', textAlign: 'center', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '1.5rem', fontSize: '1.1rem' }}>Create Account</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={labelStyle}>First Name</label>
              <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)} style={inputStyle} autoFocus />
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
          <div style={fieldStyle}>
            <label style={labelStyle}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={labelStyle}>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} style={inputStyle} />
          </div>
          <button onClick={handleSignUp} disabled={loading} style={{ width: '100%', padding: '0.85rem', background: '#cc0000', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold', letterSpacing: '1px', textTransform: 'uppercase' }}>
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
          {message && <p style={{ marginTop: '1rem', color: '#ff6666', textAlign: 'center', fontSize: '0.9rem' }}>{message}</p>}
          <p onClick={() => reset('home')} style={{ marginTop: '1rem', textAlign: 'center', color: '#cc0000', cursor: 'pointer', fontSize: '0.85rem' }}>← Back</p>
        </div>
      )}

      {/* ── FREE TRIAL ── */}
      {view === 'trial' && (
        <div style={{ background: '#2a2a2a', border: '2px solid #cc0000', borderRadius: '8px', padding: '2rem' }}>
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <h2 style={{ color: '#cc0000', letterSpacing: '2px', textTransform: 'uppercase', margin: '0 0 0.4rem', fontSize: '1.1rem' }}>Free Trial Lesson</h2>
            <p style={{ color: '#888', fontSize: '0.85rem', margin: 0 }}>Fill in your details to claim your free lesson token</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={labelStyle}>First Name *</label>
              <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)} style={inputStyle} autoFocus />
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
          <div style={fieldStyle}>
            <label style={labelStyle}>Email *</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={labelStyle}>Password *</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} style={inputStyle} />
          </div>
          <button onClick={handleTrial} disabled={loading} style={{ width: '100%', padding: '1rem', background: '#cc0000', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '1.05rem', fontWeight: 'bold', letterSpacing: '1px', textTransform: 'uppercase' }}>
            {loading ? 'Setting up your account...' : 'Claim Free Trial'}
          </button>
          {message && <p style={{ marginTop: '1rem', color: '#ff6666', textAlign: 'center', fontSize: '0.9rem' }}>{message}</p>}
          <p onClick={() => reset('home')} style={{ marginTop: '1rem', textAlign: 'center', color: '#cc0000', cursor: 'pointer', fontSize: '0.85rem' }}>← Back</p>
        </div>
      )}

      {/* ── FORGOT PASSWORD ── */}
      {view === 'forgot' && (
        <div style={{ background: '#2a2a2a', border: '1px solid #333', borderRadius: '8px', padding: '2rem' }}>
          <h2 style={{ color: '#fff', textAlign: 'center', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '0.5rem', fontSize: '1.1rem' }}>Reset Password</h2>
          <p style={{ color: '#666', textAlign: 'center', marginBottom: '1.5rem', fontSize: '0.9rem' }}>Enter your email to receive a reset link</p>
          <div style={fieldStyle}>
            <label style={labelStyle}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} autoFocus />
          </div>
          <button onClick={handleForgotPassword} disabled={loading} style={{ width: '100%', padding: '0.85rem', background: '#cc0000', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold', letterSpacing: '1px', textTransform: 'uppercase' }}>
            {loading ? 'Sending...' : 'Send Reset Link'}
          </button>
          {message && <p style={{ marginTop: '1rem', color: message.startsWith('✅') ? '#66cc66' : '#ff6666', textAlign: 'center', fontSize: '0.9rem' }}>{message}</p>}
          <p onClick={() => reset('signin')} style={{ marginTop: '1.5rem', textAlign: 'center', color: '#cc0000', cursor: 'pointer', fontSize: '0.9rem' }}>← Back to Sign In</p>
        </div>
      )}

    </main>
  )
}
