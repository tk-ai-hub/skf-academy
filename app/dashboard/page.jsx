'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

function formatHour(h) {
  if (h < 12) return `${h}:00 AM`
  if (h === 12) return `12:00 PM`
  return `${h - 12}:00 PM`
}

export default function Dashboard() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [bookings, setBookings] = useState([])
  const [balance, setBalance] = useState(0)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/login'; return }
      setUser(user)

      const { data: profileData } = await supabase
        .from('users')
        .select('first_name, last_name, phone, belt_rank')
        .eq('id', user.id)
        .single()

      setProfile(profileData)

      const { data: bookingData } = await supabase
        .from('bookings')
        .select(`
          id, status, booked_at, tenant_id, student_id,
          slots!bookings_slot_id_fkey (
            id, slot_date, start_hour
          )
        `)
        .eq('student_id', user.id)
        .eq('status', 'confirmed')
        .order('booked_at', { ascending: false })

      setBookings((bookingData || []).filter(b => b.slots))

      const { data: tokenData } = await supabase
        .from('tokens')
        .select('amount')
        .eq('student_id', user.id)

      const total = (tokenData || []).reduce((sum, t) => sum + t.amount, 0)
      setBalance(total)
    }
    load()
  }, [])

  async function cancelBooking(booking) {
    await supabase
      .from('bookings')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
      .eq('id', booking.id)

    await supabase.from('tokens').insert({
      tenant_id: booking.tenant_id,
      student_id: booking.student_id,
      amount: 1,
      reason: 'lesson cancelled - refund',
      booking_id: booking.id
    })

    const studentName = profile?.first_name
      ? `${profile.last_name || ''} ${profile.first_name}`.trim()
      : user.email

    await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'cancellation',
        studentEmail: user.email,
        studentName,
        phone: profile?.phone || '',
        date: booking.slots.slot_date,
        time: formatHour(booking.slots.start_hour),
        hour: booking.slots.start_hour
      })
    })

    setBookings(bookings.filter(b => b.id !== booking.id))
    setBalance(balance + 1)
  }

  const displayName = profile?.first_name
    ? `${profile.first_name} ${profile.last_name || ''}`.trim()
    : user?.email

  return (
    <main>
      {user && (
        <div style={{ marginBottom: '1.5rem' }}>
          <p style={{ color: '#999', margin: 0 }}>Welcome back,</p>
          <h2 style={{ color: '#fff', margin: '0.25rem 0 0', fontSize: '1.5rem' }}>{displayName}</h2>
          {profile?.belt_rank && (
            <p style={{ color: '#cc0000', fontSize: '0.8rem', letterSpacing: '2px', textTransform: 'uppercase', margin: '0.25rem 0 0' }}>
              {profile.belt_rank} belt
            </p>
          )}
        </div>
      )}

      <div style={{ background: '#2a2a2a', border: '1px solid #cc0000', padding: '1rem 1.5rem', borderRadius: '8px', marginBottom: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ color: '#cc0000', fontSize: '0.75rem', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Lesson Tokens</div>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#fff' }}>{balance}</div>
        </div>
        <div style={{ color: '#666', fontSize: '0.85rem', textAlign: 'right' }}>
          Renew monthly<br />
          <span style={{ color: '#cc0000' }}>4 tokens/month</span>
        </div>
      </div>

      <h2 style={{ color: '#fff', borderBottom: '1px solid #333', paddingBottom: '0.5rem', marginBottom: '1.5rem' }}>
        Upcoming Lessons
      </h2>

      {bookings.length === 0 ? (
        <p style={{ color: '#666' }}>No upcoming lessons booked.</p>
      ) : (
        bookings.map(b => (
          <div key={b.id} style={{ background: '#2a2a2a', border: '1px solid #333', borderRadius: '8px', padding: '1rem 1.5rem', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ margin: 0, fontWeight: 'bold', fontSize: '1.1rem', color: '#fff' }}>
                {b.slots.slot_date} at {formatHour(b.slots.start_hour)}
              </p>
              <p style={{ margin: '0.25rem 0 0', color: '#666', fontSize: '0.85rem' }}>Private Lesson</p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <a href="/book" style={{ padding: '0.4rem 1rem', background: '#cc0000', color: '#fff', textDecoration: 'none', borderRadius: '4px', fontSize: '0.9rem' }}>
                Reschedule
              </a>
              <button
                onClick={() => cancelBooking(b)}
                style={{ padding: '0.4rem 1rem', background: 'transparent', color: '#cc0000', border: '1px solid #cc0000', borderRadius: '4px', cursor: 'pointer', fontSize: '0.9rem' }}
              >
                Cancel
              </button>
            </div>
          </div>
        ))
      )}

      <a href="/book" style={{ display: 'inline-block', marginTop: '1.5rem', padding: '0.75rem 2rem', background: '#cc0000', color: '#fff', textDecoration: 'none', borderRadius: '6px', fontWeight: 'bold', letterSpacing: '1px', textTransform: 'uppercase', fontSize: '0.9rem' }}>
        + Book a Lesson
      </a>
    </main>
  )
}
