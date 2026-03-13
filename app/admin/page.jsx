'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

function formatHour(h) {
  if (h < 12) return `${h}:00 AM`
  if (h === 12) return `12:00 PM`
  return `${h - 12}:00 PM`
}

export default function Admin() {
  const [bookings, setBookings] = useState([])
  const [students, setStudents] = useState([])
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const { data: bookingData } = await supabase
      .from('bookings')
      .select(`
        id, status, booked_at, tenant_id, student_id,
        slots!bookings_slot_id_fkey (
          id, slot_date, start_hour
        ),
        users!bookings_student_id_fkey (
          full_name, email
        )
      `)
      .eq('status', 'confirmed')
      .order('booked_at', { ascending: false })

    setBookings((bookingData || []).filter(b => b.slots))

    const { data: studentData } = await supabase
      .from('users')
      .select('id, full_name, email, belt_rank')
      .eq('role', 'student')

    setStudents(studentData || [])
  }

  async function cancelBooking(booking) {
    await supabase
      .from('bookings')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancelled_by: 'admin' })
      .eq('id', booking.id)

    await supabase.from('tokens').insert({
      tenant_id: booking.tenant_id,
      student_id: booking.student_id,
      amount: 1,
      reason: 'cancelled by admin - refund',
      booking_id: booking.id
    })

    setMessage('Booking cancelled and token refunded.')
    loadData()
  }

  async function addTokens(studentId, amount) {
    const { data: tenant } = await supabase
      .from('tenants')
      .select('id')
      .eq('slug', 'skf-academy')
      .single()

    await supabase.from('tokens').insert({
      tenant_id: tenant.id,
      student_id: studentId,
      amount: amount,
      reason: 'added by admin'
    })

    setMessage(`${amount} token(s) added successfully.`)
  }

  return (
    <main style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: '700px', margin: '0 auto' }}>
      <h1>SKF Academy — Admin</h1>

      {message && (
        <p style={{ background: '#e6ffe6', padding: '0.75rem', borderRadius: '6px', color: 'green' }}>
          {message}
        </p>
      )}

      <h2>Upcoming Bookings</h2>
      {bookings.length === 0 ? (
        <p style={{ color: '#666' }}>No upcoming bookings.</p>
      ) : (
        bookings.map(b => (
          <div key={b.id} style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '1rem', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ margin: 0, fontWeight: 'bold' }}>
                {b.slots.slot_date} at {formatHour(b.slots.start_hour)}
              </p>
              <p style={{ margin: '0.25rem 0 0', color: '#666', fontSize: '0.9rem' }}>
                {b.users?.full_name || b.users?.email || 'Unknown student'}
              </p>
            </div>
            <button
              onClick={() => cancelBooking(b)}
              style={{ padding: '0.4rem 0.9rem', background: '#fff', color: '#c00', border: '1px solid #c00', borderRadius: '4px', cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        ))
      )}

      <h2 style={{ marginTop: '2rem' }}>Students</h2>
      {students.length === 0 ? (
        <p style={{ color: '#666' }}>No students yet.</p>
      ) : (
        students.map(s => (
          <div key={s.id} style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '1rem', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ margin: 0, fontWeight: 'bold' }}>{s.full_name || s.email}</p>
              <p style={{ margin: '0.25rem 0 0', color: '#666', fontSize: '0.9rem' }}>{s.belt_rank} belt</p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => addTokens(s.id, 1)}
                style={{ padding: '0.4rem 0.9rem', background: '#000', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
              >
                +1 Token
              </button>
              <button
                onClick={() => addTokens(s.id, 4)}
                style={{ padding: '0.4rem 0.9rem', background: '#000', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
              >
                +4 Tokens
              </button>
            </div>
          </div>
        ))
      )}
    </main>
  )
}