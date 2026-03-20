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
      <body>
        <header style={{
          background: 'linear-gradient(180deg, #0a0a0c 0%, #111113 100%)',
          borderBottom: '2px solid #cc0000',
          padding: '0.85rem 1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.9rem',
          position: 'sticky',
          top: 0,
          zIndex: 100,
          boxShadow: '0 2px 20px rgba(0,0,0,0.6)',
        }}>
          <img src="/logo.png" alt="SKF Academy" style={{ height: '46px', width: '46px', borderRadius: '50%', border: '1.5px solid #cc0000', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '1.15rem', fontWeight: 'bold', color: '#fff', letterSpacing: '3px', textTransform: 'uppercase', fontFamily: 'Georgia, serif', lineHeight: 1.1 }}>
              SKF Academy
            </div>
            <div style={{ fontSize: '0.65rem', color: '#cc0000', letterSpacing: '2.5px', textTransform: 'uppercase', marginTop: '0.1rem' }}>
              Shaolin Kung Fu — Est. 1986
            </div>
          </div>
        </header>

        <div style={{ maxWidth: '800px', margin: '0 auto', padding: '1.75rem 1.25rem 4rem' }}>
          {children}
        </div>

        <footer style={{
          borderTop: '1px solid #2e2e32',
          padding: '1.5rem',
          textAlign: 'center',
          color: '#3a3a42',
          fontSize: '0.8rem',
          letterSpacing: '0.5px',
        }}>
          © {new Date().getFullYear()} SKF Academy · kungfubc.com
        </footer>
      </body>
    </html>
  )
}
