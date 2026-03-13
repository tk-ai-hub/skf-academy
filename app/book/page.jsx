'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

function formatHour(h) {
  if (h < 12) return `${h}:00 AM`
  if (h === 12) return `12:00 PM`
  return `${h - 12}:00 PM`
}

function formatDate(d) {
  const date = new Date(d + 'T00:00:00')
  return date.toLocaleDateString('en-CA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
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

    await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'booking',
        studentEmail: user.email,
        date: formatDate(selectedDate),
        time: formatHour(slot.start_hour)
      })
    })

    setBalance(currentBalance - 1)
    setMessage(`Booked! See you ${formatDate(selectedDate)} at ${formatHour(slot.start_hour)}`)
    setBooking(slot.id)
  }

  return (
    <main>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h2 style={{ color: '#fff', margin: 0, letterSpacing: '1px', textTransform: 'uppercase' }}>Book a Private Lesson</h2>
        <div style={{ background: '#2a2a2a', border: '1px solid #cc0000', borderRadius: '6px', padding: '0.5rem 1rem', textAlign: 'center' }}>
          <div style={{ color: '#cc0000', fontSize: '0.7rem', letterSpacing: '1px', textTransform: 'uppercase' }}>Tokens</div>
          <div style={{ color: '#fff', fontSize: '1.5rem', fontWeight: 'bold' }}>{balance}</div>
        </div>
      </div>

      <div style={{ marginBottom: '2rem' }}>
        <label style={{ display: 'block', color: '#999', fontSize: '0.8rem', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Select a Date</label>
        <select
          value={selectedDate}
          onChange={e => setSelectedDate(e.target.value)}
          style={{ width: '100%', padding: '0.75rem', background: '#2a2a2a', border: '1px solid #444', borderRadius: '6px', color: '#fff', fontSize: '1rem' }}
        >
          {availableDates.map(d => (
            <option key={d} value={d}>{formatDate(d)}</option>
          ))}
        </select>
      </div>

      <label style={{ display: 'block', color: '#999', fontSize: '0.8rem', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '1rem' }}>Available Times</label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '2rem' }}>
        {slotsForDate.map(slot => (
          <button
            key={slot.id}
            onClick={() => bookSlot(slot)}
            disabled={booking === slot.id}
            style={{
              padding: '0.85rem',
              background: booking === slot.id ? '#333' : '#2a2a2a',
              color: booking === slot.id ? '#666' : '#fff',
              border: booking === slot.id ? '1px solid #333' : '1px solid #444',
              borderRadius: '6px',
              cursor: booking === slot.id ? 'default' : 'pointer',
              fontSize: '0.9rem'
            }}
            onMouseEnter={e => { if (booking !== slot.id) e.target.style.borderColor = '#cc0000' }}
            onMouseLeave={e => { if (booking !== slot.id) e.target.style.borderColor = '#444' }}
          >
            {formatHour(slot.start_hour)}
          </button>
        ))}
      </div>

      {message && (
        <div style={{ background: '#1a3a1a', border: '1px solid #2a6a2a', borderRadius: '8px', padding: '1rem 1.5rem', marginBottom: '1.5rem' }}>
          <p style={{ margin: 0, color: '#66cc66', fontWeight: 'bold' }}>{message}</p>
        </div>
      )}

      <a href="/dashboard" style={{ color: '#666', textDecoration: 'none', fontSize: '0.9rem' }}>
        ← Back to dashboard
      </a>
    </main>
  )
}