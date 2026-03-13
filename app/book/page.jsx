'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

function formatHour(h) {
  if (h < 12) return `${h}:00 AM`
  if (h === 12) return `12:00 PM`
  return `${h - 12}:00 PM`
}

export default function Book() {
  const [slots, setSlots] = useState([])
  const [selectedDate, setSelectedDate] = useState('')
  const [availableDates, setAvailableDates] = useState([])
  const [booking, setBooking] = useState(null)
  const [user, setUser] = useState(null)
  const [message, setMessage] = useState('')
  const [balance, setBalance] = useState(0)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) window.location.href = '/login'
      else setUser(data.user)
    })
  }, [])

  useEffect(() => {
    async function loadSlots() {
      const { data: bookedSlots } = await supabase
        .from('bookings')
        .select('slot_id')
        .eq('status', 'confirmed')

      const bookedIds = (bookedSlots || []).map(b => b.slot_id)

      const { data } = await supabase
        .from('slots')
        .select('*')
        .eq('is_blocked', false)
        .gte('slot_date', new Date().toISOString().split('T')[0])
        .not('id', 'in', `(${bookedIds.length > 0 ? bookedIds.join(',') : '00000000-0000-0000-0000-000000000000'})`)
        .order('slot_date', { ascending: true })
        .order('start_hour', { ascending: true })

      setSlots(data || [])
      const dates = [...new Set(data.map(s => s.slot_date))]
      setAvailableDates(dates)
      if (dates.length > 0) setSelectedDate(dates[0])
    }
    loadSlots()
  }, [])

  useEffect(() => {
    async function loadBalance() {
      if (!user) return
      const { data } = await supabase
        .from('tokens')
        .select('amount')
        .eq('student_id', user.id)
      const total = (data || []).reduce((sum, t) => sum + t.amount, 0)
      setBalance(total)
    }
    loadBalance()
  }, [user])

  const slotsForDate = slots.filter(s => s.slot_date === selectedDate)

  async function bookSlot(slot) {
    if (!user) return
    setMessage('')

    const { data: tokenData } = await supabase
      .from('tokens')
      .select('amount')
      .eq('student_id', user.id)

    const currentBalance = (tokenData || []).reduce((sum, t) => sum + t.amount, 0)

    if (currentBalance <= 0) {
      setMessage('You have no tokens left. Please contact your instructor to add more.')
      return
    }

    const { data: newBooking, error } = await supabase
      .from('bookings')
      .insert({
        tenant_id: slot.tenant_id,
        student_id: user.id,
        slot_id: slot.id,
        status: 'confirmed'
      })
      .select()
      .single()

    if (error) {
      setMessage('Could not book this slot. ' + error.message)
      return
    }

    await supabase.from('tokens').insert({
      tenant_id: slot.tenant_id,
      student_id: user.id,
      amount: -1,
      reason: 'lesson booked',
      booking_id: newBooking.id
    })

    setBalance(currentBalance - 1)
    setMessage(`Booked! See you ${selectedDate} at ${formatHour(slot.start_hour)}`)
    setBooking(slot.id)
  }

  return (
    <main style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: '600px', margin: '0 auto' }}>
      <h1>SKF Academy</h1>
      <h2>Book a Private Lesson</h2>

      <p style={{ background: '#f5f5f5', padding: '0.75rem', borderRadius: '6px' }}>
        Tokens remaining: <strong>{balance}</strong>
      </p>

      <div style={{ marginBottom: '1.5rem', marginTop: '1rem' }}>
        <label style={{ fontWeight: 'bold' }}>Select a date:</label>
        <select
          value={selectedDate}
          onChange={e => setSelectedDate(e.target.value)}
          style={{ display: 'block', marginTop: '0.5rem', padding: '0.5rem', width: '100%' }}
        >
          {availableDates.map(d => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
        {slotsForDate.map(slot => (
          <button
            key={slot.id}
            onClick={() => bookSlot(slot)}
            disabled={booking === slot.id}
            style={{
              padding: '0.75rem',
              background: booking === slot.id ? '#ccc' : '#000',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.9rem'
            }}
          >
            {formatHour(slot.start_hour)}
          </button>
        ))}
      </div>

      {message && (
        <p style={{ marginTop: '1.5rem', color: 'green', fontWeight: 'bold' }}>
          {message}
        </p>
      )}

      <p style={{ marginTop: '2rem' }}>
        <a href="/dashboard">← Back to dashboard</a>
      </p>
    </main>
  )
}