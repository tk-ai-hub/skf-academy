export default function Confirm() {
  return (
    <main style={{ maxWidth: '400px', margin: '4rem auto', textAlign: 'center' }}>
      <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>✉️</div>
      <h2 style={{ color: '#fff', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
        Check Your Email
      </h2>
      <p style={{ color: '#999', marginBottom: '2rem', lineHeight: '1.6' }}>
        We've sent a confirmation link to your email address. Click the link to activate your account and start booking lessons.
      </p>

      <div style={{ background: '#2a2a2a', border: '1px solid #333', borderRadius: '8px', padding: '1.5rem', marginBottom: '2rem' }}>
        <p style={{ color: '#666', fontSize: '0.9rem', margin: 0 }}>
          Didn't receive the email? Check your spam folder or{' '}
          <a href="/login" style={{ color: '#cc0000', textDecoration: 'none' }}>
            try signing up again
          </a>
          .
        </p>
      </div>

      <a href="/login" style={{ color: '#666', textDecoration: 'none', fontSize: '0.9rem' }}>
        ← Back to login
      </a>
    </main>
  )
}