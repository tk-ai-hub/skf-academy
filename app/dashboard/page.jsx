'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

export default function Dashboard() {
  const [user, setUser] = useState(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
    })
  }, [])

  return (
    <main style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>SKF Academy</h1>
      {user ? (
        <>
          <p>Welcome back, {user.email}!</p>
          <p>Your dashboard is coming soon.</p>
        </>
      ) : (
        <p>Loading...</p>
      )}
    </main>
  )
}