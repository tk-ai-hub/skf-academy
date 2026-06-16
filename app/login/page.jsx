'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

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
    setIsIOS(ios); setIsMac(mac)
    if (!standalone) {
      if (ios || mac) { setShowInstallBanner(true) }
      else {
        window.addEventListener('beforeinstallprompt', (e) => {
          e.preventDefault(); setInstallPrompt(e); setShowInstallBanner(true)
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
    setPhone(''); setDob(''); setMessage(''); setView(nextView)
  }

  async function handleSignIn() {
    if (!email || !password) { setMessage('Please enter your email and password.'); return }
    setLoading(true); setMessage('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) { setMessage(error.message); return }
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
    window.location.href = profile?.role === 'admin' ? '/admin' : '/dashboard'
  }

  async function handleSignUp() {
    if (!firstName || !email || !password) { setMessage('First name, email and password are required.'); return }
    setLoading(true); setMessage('')
    const res = await fetch('/api/signup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
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
      method: 'POST', headers: { 'Content-Type': 'application/json' },
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

  const inp = {
    width: '100%', padding: '10px 16px', background: '#1a1a1a',
    border: '1px solid #2a2a2a', borderRadius: '8px', color: '#fff',
    fontSize: '15px', boxSizing: 'border-box', outline: 'none',
    transition: 'border-color 0.2s',
  }
  const lbl = {
    display: 'block', color: '#555', fontSize: '11px',
    letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '6px',
  }
  const field = { marginBottom: '16px' }

  return (
    <div style={{ minHeight: '80vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '26px 16px' }}>

      {/* PWA Install Banner */}
      {showInstallBanner && (
        <div style={{ width: '100%', maxWidth: '420px', background: '#111', border: '1px solid #cc0000', borderRadius: '10px', padding: '16px', marginBottom: '26px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <p style={{ margin: 0, color: '#fff', fontWeight: 'bold', fontSize: '13px' }}>Install SKF Academy</p>
            <button onClick={() => setShowInstallBanner(false)} style={{ background: 'transparent', color: '#444', border: 'none', cursor: 'pointer', fontSize: '18px', lineHeight: 1, padding: 0 }}>×</button>
          </div>
          {isIOS ? (
            <div style={{ marginTop: '10px' }}>
              <p style={{ margin: '0 0 6px', color: '#777', fontSize: '13px' }}>Add this app to your home screen:</p>
              <p style={{ margin: '4px 0', color: '#aaa', fontSize: '13px' }}>1. Tap <strong style={{ color: '#fff' }}>Share</strong> in Safari</p>
              <p style={{ margin: '4px 0', color: '#aaa', fontSize: '13px' }}>2. Tap <strong style={{ color: '#fff' }}>"Add to Home Screen"</strong></p>
            </div>
          ) : isMac ? (
            <div style={{ marginTop: '10px' }}>
              <p style={{ margin: '0 0 6px', color: '#777', fontSize: '13px' }}>Add this app to your Mac dock:</p>
              <p style={{ margin: '4px 0', color: '#aaa', fontSize: '13px' }}>1. Click <strong style={{ color: '#fff' }}>Share</strong> in Safari toolbar</p>
              <p style={{ margin: '4px 0', color: '#aaa', fontSize: '13px' }}>2. Click <strong style={{ color: '#fff' }}>"Add to Dock"</strong></p>
            </div>
          ) : (
            <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ margin: 0, color: '#777', fontSize: '13px' }}>Add to your home screen for quick access</p>
              <button onClick={handleInstall} style={{ padding: '6px 16px', background: '#cc0000', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', marginLeft: '16px' }}>Install</button>
            </div>
          )}
        </div>
      )}

      {/* Logo & Branding */}
      <div style={{ textAlign: 'center', marginBottom: '42px' }}>
        <img
          src="/logo.png"
          alt="SKF Academy"
          style={{ height: '90px', width: '90px', borderRadius: '50%', border: '2px solid #cc0000', display: 'block', margin: '0 auto 16px', boxShadow: '0 0 40px rgba(204,0,0,0.25)' }}
        />
        <div style={{ color: '#fff', fontSize: '24px', fontWeight: 'bold', letterSpacing: '4px', textTransform: 'uppercase' }}>SKF Academy</div>
        <div style={{ color: '#444', fontSize: '11px', letterSpacing: '3px', textTransform: 'uppercase', marginTop: '6px' }}>Shaolin Kung Fu — Est. 1986</div>
      </div>

      <div style={{ width: '100%', maxWidth: '420px' }}>

        {/* ── HOME ── */}
        {view === 'home' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button
              onClick={() => reset('trial')}
              style={{ width: '100%', padding: '16px', background: '#cc0000', color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '15px', fontWeight: 'bold', letterSpacing: '1px', textTransform: 'uppercase', boxShadow: '0 4px 24px rgba(204,0,0,0.35)' }}
            >
              Free Trial Lesson / Meeting
            </button>
            <p style={{ color: '#555', textAlign: 'center', fontSize: '13px', margin: '0 0 6px' }}>
              No commitment — get 1 free token to book your first lesson
            </p>

            <button
              onClick={() => reset('signup')}
              style={{ width: '100%', padding: '14px', background: 'transparent', color: '#fff', border: '2px solid #333', borderRadius: '10px', cursor: 'pointer', fontSize: '15px', fontWeight: 'bold', letterSpacing: '1px', textTransform: 'uppercase' }}
            >
              Create Account
            </button>

            <p
              onClick={() => reset('signin')}
              style={{ textAlign: 'center', color: '#555', cursor: 'pointer', fontSize: '13px', margin: '6px 0 0' }}
            >
              Already have an account? <span style={{ color: '#cc0000' }}>Sign in</span>
            </p>
          </div>
        )}

        {/* ── SIGN IN ── */}
        {view === 'signin' && (
          <div style={{ background: '#111', border: '1px solid #222', borderRadius: '10px', padding: '26px' }}>
            <h2 style={{ color: '#fff', textAlign: 'center', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '26px', fontSize: '15px', margin: '0 0 26px' }}>Sign In</h2>
            <div style={field}>
              <label style={lbl}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={inp} autoFocus />
            </div>
            <div style={{ marginBottom: '26px' }}>
              <label style={lbl}>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSignIn()} style={inp} />
            </div>
            <button onClick={handleSignIn} disabled={loading} style={{ width: '100%', padding: '13px', background: loading ? '#333' : '#cc0000', color: loading ? '#666' : '#fff', border: 'none', borderRadius: '8px', cursor: loading ? 'not-allowed' : 'pointer', fontSize: '15px', fontWeight: 'bold', letterSpacing: '1px', textTransform: 'uppercase' }}>
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
            {message && <p style={{ marginTop: '16px', color: '#ff6666', textAlign: 'center', fontSize: '13px' }}>{message}</p>}
            <p onClick={() => reset('forgot')} style={{ marginTop: '16px', textAlign: 'center', color: '#555', cursor: 'pointer', fontSize: '13px' }}>Forgot password?</p>
            <p onClick={() => reset('home')} style={{ marginTop: '6px', textAlign: 'center', color: '#cc0000', cursor: 'pointer', fontSize: '13px' }}>← Back</p>
          </div>
        )}

        {/* ── SIGN UP ── */}
        {view === 'signup' && (
          <div style={{ background: '#111', border: '1px solid #222', borderRadius: '10px', padding: '26px' }}>
            <h2 style={{ color: '#fff', textAlign: 'center', letterSpacing: '2px', textTransform: 'uppercase', margin: '0 0 26px', fontSize: '15px' }}>Create Account</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
              <div>
                <label style={lbl}>First Name</label>
                <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)} style={inp} autoFocus />
              </div>
              <div>
                <label style={lbl}>Last Name</label>
                <input type="text" value={lastName} onChange={e => setLastName(e.target.value)} style={inp} />
              </div>
            </div>
            <div style={field}>
              <label style={lbl}>Phone Number</label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} style={inp} />
            </div>
            <div style={field}>
              <label style={lbl}>Date of Birth</label>
              <input type="date" value={dob} onChange={e => setDob(e.target.value)} style={{ ...inp, colorScheme: 'dark' }} />
            </div>
            <div style={field}>
              <label style={lbl}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={inp} />
            </div>
            <div style={{ marginBottom: '26px' }}>
              <label style={lbl}>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} style={inp} />
            </div>
            <button onClick={handleSignUp} disabled={loading} style={{ width: '100%', padding: '13px', background: loading ? '#333' : '#cc0000', color: loading ? '#666' : '#fff', border: 'none', borderRadius: '8px', cursor: loading ? 'not-allowed' : 'pointer', fontSize: '15px', fontWeight: 'bold', letterSpacing: '1px', textTransform: 'uppercase' }}>
              {loading ? 'Creating account…' : 'Create Account'}
            </button>
            {message && <p style={{ marginTop: '16px', color: '#ff6666', textAlign: 'center', fontSize: '13px' }}>{message}</p>}
            <p onClick={() => reset('home')} style={{ marginTop: '16px', textAlign: 'center', color: '#cc0000', cursor: 'pointer', fontSize: '13px' }}>← Back</p>
          </div>
        )}

        {/* ── FREE TRIAL ── */}
        {view === 'trial' && (
          <div style={{ background: '#111', border: '2px solid #cc0000', borderRadius: '10px', padding: '26px', boxShadow: '0 0 40px rgba(204,0,0,0.15)' }}>
            <div style={{ textAlign: 'center', marginBottom: '26px' }}>
              <h2 style={{ color: '#cc0000', letterSpacing: '2px', textTransform: 'uppercase', margin: '0 0 6px', fontSize: '15px' }}>Free Trial Lesson</h2>
              <p style={{ color: '#555', fontSize: '13px', margin: 0 }}>Fill in your details to claim your free lesson token</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
              <div>
                <label style={lbl}>First Name *</label>
                <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)} style={inp} autoFocus />
              </div>
              <div>
                <label style={lbl}>Last Name</label>
                <input type="text" value={lastName} onChange={e => setLastName(e.target.value)} style={inp} />
              </div>
            </div>
            <div style={field}>
              <label style={lbl}>Phone Number</label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} style={inp} />
            </div>
            <div style={field}>
              <label style={lbl}>Date of Birth</label>
              <input type="date" value={dob} onChange={e => setDob(e.target.value)} style={{ ...inp, colorScheme: 'dark' }} />
            </div>
            <div style={field}>
              <label style={lbl}>Email *</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={inp} />
            </div>
            <div style={{ marginBottom: '26px' }}>
              <label style={lbl}>Password *</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} style={inp} />
            </div>
            <button onClick={handleTrial} disabled={loading} style={{ width: '100%', padding: '14px', background: loading ? '#333' : '#cc0000', color: loading ? '#666' : '#fff', border: 'none', borderRadius: '8px', cursor: loading ? 'not-allowed' : 'pointer', fontSize: '15px', fontWeight: 'bold', letterSpacing: '1px', textTransform: 'uppercase' }}>
              {loading ? 'Setting up your account…' : 'Claim Free Trial'}
            </button>
            {message && <p style={{ marginTop: '16px', color: '#ff6666', textAlign: 'center', fontSize: '13px' }}>{message}</p>}
            <p onClick={() => reset('home')} style={{ marginTop: '16px', textAlign: 'center', color: '#cc0000', cursor: 'pointer', fontSize: '13px' }}>← Back</p>
          </div>
        )}

        {/* ── FORGOT PASSWORD ── */}
        {view === 'forgot' && (
          <div style={{ background: '#111', border: '1px solid #222', borderRadius: '10px', padding: '26px' }}>
            <h2 style={{ color: '#fff', textAlign: 'center', letterSpacing: '2px', textTransform: 'uppercase', margin: '0 0 6px', fontSize: '15px' }}>Reset Password</h2>
            <p style={{ color: '#555', textAlign: 'center', marginBottom: '26px', fontSize: '13px' }}>Enter your email to receive a reset link</p>
            <div style={field}>
              <label style={lbl}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={inp} autoFocus />
            </div>
            <button onClick={handleForgotPassword} disabled={loading} style={{ width: '100%', padding: '13px', background: loading ? '#333' : '#cc0000', color: loading ? '#666' : '#fff', border: 'none', borderRadius: '8px', cursor: loading ? 'not-allowed' : 'pointer', fontSize: '15px', fontWeight: 'bold', letterSpacing: '1px', textTransform: 'uppercase' }}>
              {loading ? 'Sending…' : 'Send Reset Link'}
            </button>
            {message && <p style={{ marginTop: '16px', color: message.startsWith('✅') ? '#66cc66' : '#ff6666', textAlign: 'center', fontSize: '13px' }}>{message}</p>}
            <p onClick={() => reset('signin')} style={{ marginTop: '26px', textAlign: 'center', color: '#cc0000', cursor: 'pointer', fontSize: '13px' }}>← Back to Sign In</p>
          </div>
        )}

      </div>
    </div>
  )
}
