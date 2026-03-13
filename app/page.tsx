import { supabase } from './supabase'

export default async function Home() {
  const { data: tenants } = await supabase
    .from('tenants')
    .select('*')

  return (
    <main style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>SKF Academy</h1>
      <p>Database connection test:</p>
      {tenants?.map(t => (
        <div key={t.id}>
          <strong>{t.name}</strong> — {t.slug}
        </div>
      ))}
    </main>
  )
}
