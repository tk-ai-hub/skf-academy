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
  const [bookings, setBookings] = useState([])
  const [balance, setBalance] = useState(0)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/login'; return }
      setUser(user)

      const { data: bookingData, error } = await supabase
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

      console.log('bookings:', bookingData, 'error:', error)
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

    setBookings(bookings.filter(b => b.id !== booking.id))
    setBalance(balance + 1)
  }

  return (
    <main style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: '500px', margin: '0 auto' }}>
      <h1>SKF Academy</h1>
      {user && <p style={{ color: '#666' }}>Welcome back, {user.email}</p>}

      <div style={{ background: '#f5f5f5', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem' }}>
        <strong>Tokens remaining: {balance}</strong>
        <span style={{ color: '#666', marginLeft: '0.5rem', fontSize: '0.9rem' }}>renew monthly</span>
      </div>

      <h2>Upcoming Lessons</h2>
      {bookings.length === 0 ? (
        <p style={{ color: '#666' }}>No upcoming lessons booked.</p>
      ) : (
        bookings.map(b => (
          <div key={b.id} style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '1rem', marginBottom: '1rem' }}>
            <p style={{ margin: 0, fontWeight: 'bold', fontSize: '1.1rem' }}>
              {b.slots.slot_date} at {formatHour(b.slots.start_hour)}
            </p>
            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.75rem' }}>
              <a href="/book" style={{ padding: '0.4rem 0.9rem', background: '#000', color: '#fff', textDecoration: 'none', borderRadius: '4px', fontSize: '0.9rem' }}>
                Reschedule
              </a>
              <button
                onClick={() => cancelBooking(b)}
                style={{ padding: '0.4rem 0.9rem', background: '#fff', color: '#c00', border: '1px solid #c00', borderRadius: '4px', cursor: 'pointer', fontSize: '0.9rem' }}
              >
                Cancel
              </button>
            </div>
          </div>
        ))
      )}

      <a href="/book" style={{ display: 'inline-block', marginTop: '1rem', padding: '0.75rem 1.5rem', background: '#000', color: '#fff', textDecoration: 'none', borderRadius: '6px' }}>
        + Book a Lesson
      </a>
    </main>
  )
}