import './globals.css'

export const metadata = {
  title: 'SKF Academy',
  description: 'Shaolin Kung Fu Academy — Book your private lesson',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#cc0000" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="SKF Academy" />
        <link rel="apple-touch-icon" href="/SKF_APP.png" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </head>
      <body style={{
        margin: 0,
        padding: 0,
        background: '#1a1a1a',
        color: '#fff',
        fontFamily: "'Georgia', serif",
        minHeight: '100vh'
      }}>
        <header style={{
          background: '#111',
          borderBottom: '3px solid #cc0000',
          padding: '1rem 2rem',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem'
        }}>
          <img src="/logo.png" alt="SKF Academy" style={{ height: '60px', width: '60px', borderRadius: '50%' }} />
          <div>
            <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#fff', letterSpacing: '3px', textTransform: 'uppercase' }}>
              SKF Academy
            </div>
            <div style={{ fontSize: '0.75rem', color: '#cc0000', letterSpacing: '3px', textTransform: 'uppercase' }}>
              Shaolin Kung Fu — Est. 1986
            </div>
          </div>
        </header>
        <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem' }}>
          {children}
        </div>
        <footer style={{
          borderTop: '1px solid #333',
          padding: '1.5rem',
          textAlign: 'center',
          color: '#666',
          fontSize: '0.85rem',
          marginTop: '4rem'
        }}>
          © {new Date().getFullYear()} SKF Academy · kungfubc.com
        </footer>
      </body>
    </html>
  )
}
