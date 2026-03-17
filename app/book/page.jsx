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

function formatDateShort(d) {
  const date = new Date(d + 'T00:00:00')
  return date.toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' })
}

function isBirthday(dateStr, dob) {
  if (!dob) return false
  const [, month, day] = dateStr.split('-').map(Number)
  const [, bMonth, bDay] = dob.split('-').map(Number)
  return month === bMonth && day === bDay
}

function addWeeks(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n * 7)
  return d.toISOString().split('T')[0]
}

function getWeeklyOccurrences(startDate, numWeeks) {
  const occurrences = []
  for (let i = 0; i < numWeeks; i++) {
    occurrences.push(addWeeks(startDate, i))
  }
  return occurrences
}

export default function Book() {
  const [slots, setSlots] = useState([])
  const [selectedDate, setSelectedDate] = useState('')
  const [availableDates, setAvailableDates] = useState([])
  const [bookedIds, setBookedIds] = useState([])
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [message, setMessage] = useState('')
  const [balance, setBalance] = useState(0)
  const [isRecurring, setIsRecurring] = useState(false)
  const [recurringWeeks, setRecurringWeeks] = useState(4)
  const [recurringPreview, setRecurringPreview] = useState([])
  const [selectedSlot, setSelectedSlot] = useState(null)   // selected but not yet booked
  const [isProcessing, setIsProcessing] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { window.location.href = '/login'; return }
      setUser(data.user)
      const { data: profileData } = await supabase
        .from('users')
        .select('first_name, last_name, phone, date_of_birth')
        .eq('id', data.user.id)
        .single()
      setProfile(profileData)
    })
  }, [])

  useEffect(() => {
    async function loadSlots() {
      const { data: existingBookings } = await supabase
        .from('bookings')
        .select('slot_id')
        .eq('status', 'confirmed')
      const alreadyBooked = (existingBookings || []).map(b => b.slot_id)
      setBookedIds(alreadyBooked)
      const today = new Date().toISOString().split('T')[0]
      const ninetyDaysOut = new Date()
      ninetyDaysOut.setDate(ninetyDaysOut.getDate() + 90)
      const maxDate = ninetyDaysOut.toISOString().split('T')[0]
      const { data } = await supabase
        .from('slots')
        .select('*')
        .eq('is_blocked', false)
        .gte('slot_date', today)
        .lte('slot_date', maxDate)
        .not('id', 'in', `(${alreadyBooked.length > 0 ? alreadyBooked.join(',') : '00000000-0000-0000-0000-000000000000'})`)
        .order('slot_date', { ascending: true })
        .order('start_hour', { ascending: true })
      setSlots(data || [])
      const dates = [...new Set((data || []).map(s => s.slot_date))]
      setAvailableDates(dates)
      if (dates.length > 0) setSelectedDate(dates[0])
    }
    loadSlots()
  }, [])

  // Recurring preview
  useEffect(() => {
    if (!isRecurring || !selectedDate || !selectedSlot) {
      setRecurringPreview([])
      return
    }
    const occurrences = getWeeklyOccurrences(selectedDate, recurringWeeks)
    const preview = occurrences.map(date => {
      const slotOnDate = slots.find(s => s.slot_date === date && s.start_hour === selectedSlot.start_hour)
      return { date, available: !!slotOnDate, slot: slotOnDate || null }
    })
    setRecurringPreview(preview)
  }, [isRecurring, selectedDate, recurringWeeks, selectedSlot, slots])

  const slotsForDate = slots.filter(s => s.slot_date === selectedDate && !bookedIds.includes(s.id))
  const birthdayToday = isBirthday(selectedDate, profile?.date_of_birth)

  function handleSlotClick(slot) {
    if (isProcessing) return
    // Just select the slot — don't book yet
    setSelectedSlot(prev => prev?.id === slot.id ? null : slot)
    setMessage('')
  }

  async function bookSlot() {
    if (!user || isProcessing || !selectedSlot) return
    setIsProcessing(true)
    setMessage('')

    try {
      const { data: tokenData } = await supabase.from('tokens').select('amount').eq('student_id', user.id)
      const currentBalance = (tokenData || []).reduce((sum, t) => sum + t.amount, 0)

      if (isRecurring) {
        const occurrences = getWeeklyOccurrences(selectedSlot.slot_date, recurringWeeks)
        const availableSlots = []
        for (const date of occurrences) {
          const s = slots.find(s2 => s2.slot_date === date && s2.start_hour === selectedSlot.start_hour)
          if (s && !bookedIds.includes(s.id)) availableSlots.push(s)
        }
        if (currentBalance < availableSlots.length) {
          setMessage(`You only have ${currentBalance} token(s) but need ${availableSlots.length} for ${availableSlots.length} recurring lessons.`)
          return
        }
        const studentName = profile?.first_name ? `${profile.last_name || ''} ${profile.first_name}`.trim() : user.email
        const newBookedIds = []
        const groupId = selectedSlot.id + '-' + Date.now()
        for (const s of availableSlots) {
          const { data: newBooking, error } = await supabase
            .from('bookings')
            .insert({ tenant_id: s.tenant_id, student_id: user.id, slot_id: s.id, status: 'confirmed', is_recurring: true, recurring_group_id: groupId })
            .select().single()
          if (!error && newBooking) {
            await supabase.from('tokens').insert({ tenant_id: s.tenant_id, student_id: user.id, amount: -1, reason: 'recurring lesson booked', booking_id: newBooking.id })
            newBookedIds.push(s.id)
            await fetch('/api/send-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'booking', studentEmail: user.email, studentName, phone: profile?.phone || '', date: s.slot_date, time: formatHour(s.start_hour), hour: s.start_hour, isRecurring: true, totalOccurrences: availableSlots.length }) })
          }
        }
        setBalance(currentBalance - newBookedIds.length)
        setBookedIds(prev => [...prev, ...newBookedIds])
        setSelectedSlot(null)
        setMessage(`✅ Booked ${newBookedIds.length} recurring lesson${newBookedIds.length > 1 ? 's' : ''} every week at ${formatHour(selectedSlot.start_hour)}!`)
      } else {
        if (currentBalance <= 0) {
          setMessage('You have no tokens left. Please contact your instructor to add more.')
          return
        }
        const { data: newBooking, error } = await supabase
          .from('bookings')
          .insert({ tenant_id: selectedSlot.tenant_id, student_id: user.id, slot_id: selectedSlot.id, status: 'confirmed' })
          .select().single()
        if (error) { setMessage('Could not book this slot. ' + error.message); return }
        await supabase.from('tokens').insert({ tenant_id: selectedSlot.tenant_id, student_id: user.id, amount: -1, reason: 'lesson booked', booking_id: newBooking.id })
        const studentName = profile?.first_name ? `${profile.last_name || ''} ${profile.first_name}`.trim() : user.email
        await fetch('/api/send-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'booking', studentEmail: user.email, studentName, phone: profile?.phone || '', date: selectedSlot.slot_date, time: formatHour(selectedSlot.start_hour), hour: selectedSlot.start_hour }) })
        setBalance(currentBalance - 1)
        setBookedIds(prev => [...prev, selectedSlot.id])
        setSelectedSlot(null)
        setMessage(`✅ Booked! See you ${formatDate(selectedDate)} at ${formatHour(selectedSlot.start_hour)}`)
      }
    } finally {
      setIsProcessing(false)
    }
  }

  const availableCount = isRecurring && selectedSlot
    ? recurringPreview.filter(p => p.available).length
    : 0

  return (
    <main>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h2 style={{ color: '#fff', margin: 0, letterSpacing: '1px', textTransform: 'uppercase' }}>Book a Private Lesson</h2>
        <div style={{ background: '#2a2a2a', border: '1px solid #cc0000', borderRadius: '6px', padding: '0.5rem 1rem', textAlign: 'center' }}>
          <div style={{ color: '#cc0000', fontSize: '0.7rem', letterSpacing: '1px', textTransform: 'uppercase' }}>Tokens</div>
          <div style={{ color: '#fff', fontSize: '1.5rem', fontWeight: 'bold' }}>{balance}</div>
        </div>
      </div>

      {/* Date Selector */}
      <div style={{ marginBottom: '1.5rem' }}>
        <label style={{ display: 'block', color: '#999', fontSize: '0.8rem', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Select a Date</label>
        <select value={selectedDate} onChange={e => { setSelectedDate(e.target.value); setSelectedSlot(null) }} style={{ width: '100%', padding: '0.75rem', background: '#2a2a2a', border: '1px solid #444', borderRadius: '6px', color: '#fff', fontSize: '1rem' }}>
          {availableDates.map(d => (
            <option key={d} value={d}>{formatDate(d)}{isBirthday(d, profile?.date_of_birth) ? ' 🎂' : ''}</option>
          ))}
        </select>
      </div>

      {/* Birthday Banner */}
      {birthdayToday && (
        <div style={{ background: '#2a1a1a', border: '1px solid #cc0000', borderRadius: '8px', padding: '0.75rem 1.5rem', marginBottom: '1.5rem', textAlign: 'center' }}>
          <p style={{ margin: 0, color: '#cc0000' }}>Happy Birthday{profile?.first_name ? `, ${profile.first_name}` : ''}! Book a special lesson today! 🎂</p>
        </div>
      )}

      {/* Recurring Toggle */}
      <div style={{ background: '#2a2a2a', border: '1px solid #333', borderRadius: '8px', padding: '1rem 1.25rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ color: '#fff', fontWeight: 'bold', fontSize: '0.95rem' }}>Recurring Weekly Booking</div>
            <div style={{ color: '#666', fontSize: '0.8rem', marginTop: '0.2rem' }}>Book the same time slot every week</div>
          </div>
          <button onClick={() => { setIsRecurring(!isRecurring); setSelectedSlot(null) }} style={{ width: '48px', height: '26px', borderRadius: '13px', border: 'none', cursor: 'pointer', background: isRecurring ? '#cc0000' : '#444', position: 'relative', transition: 'background 0.2s' }}>
            <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#fff', position: 'absolute', top: '3px', transition: 'left 0.2s', left: isRecurring ? '25px' : '3px' }} />
          </button>
        </div>
        {isRecurring && (
          <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #333' }}>
            <label style={{ color: '#999', fontSize: '0.8rem', letterSpacing: '1px', textTransform: 'uppercase', display: 'block', marginBottom: '0.5rem' }}>Number of Weeks</label>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {[2, 4, 6, 8, 12].map(w => (
                <button key={w} onClick={() => setRecurringWeeks(w)} style={{ padding: '0.4rem 1rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.9rem', background: recurringWeeks === w ? '#cc0000' : '#1a1a1a', color: '#fff', border: recurringWeeks === w ? '1px solid #cc0000' : '1px solid #444' }}>{w}w</button>
              ))}
            </div>
            <p style={{ color: '#666', fontSize: '0.8rem', margin: '0.75rem 0 0' }}>⚡ Select a time below — we'll book it every week for {recurringWeeks} weeks ({recurringWeeks} tokens)</p>
          </div>
        )}
      </div>

      {/* Time Slots */}
      <label style={{ display: 'block', color: '#999', fontSize: '0.8rem', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '1rem' }}>Available Times</label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '1.5rem' }}>
        {slotsForDate.map(slot => {
          const isSelected = selectedSlot?.id === slot.id
          return (
            <button
              key={slot.id}
              onClick={() => handleSlotClick(slot)}
              disabled={isProcessing}
              style={{
                padding: '0.85rem',
                background: isSelected ? '#cc0000' : '#2a2a2a',
                color: '#fff',
                border: isSelected ? '1px solid #cc0000' : '1px solid #444',
                borderRadius: '6px',
                cursor: isProcessing ? 'not-allowed' : 'pointer',
                fontSize: '0.9rem',
                fontWeight: isSelected ? 'bold' : 'normal',
                transform: isSelected ? 'scale(1.05)' : 'scale(1)',
                transition: 'all 0.15s',
                opacity: isProcessing ? 0.6 : 1
              }}
            >
              {formatHour(slot.start_hour)}
              {isSelected && <div style={{ fontSize: '0.65rem', marginTop: '2px', opacity: 0.85 }}>✓ selected</div>}
            </button>
          )
        })}
        {slotsForDate.length === 0 && <p style={{ color: '#666', gridColumn: '1 / -1', margin: 0 }}>No available times for this date.</p>}
      </div>

      {/* Recurring Preview (shows when recurring + slot selected) */}
      {isRecurring && selectedSlot && recurringPreview.length > 0 && (
        <div style={{ background: '#1a1a1a', border: '1px solid #444', borderRadius: '10px', padding: '1.25rem', marginBottom: '1.5rem' }}>
          <h3 style={{ color: '#fff', margin: '0 0 1rem', fontSize: '1rem', letterSpacing: '1px', textTransform: 'uppercase' }}>
            📅 Recurring Preview — {formatHour(selectedSlot.start_hour)} Weekly
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {recurringPreview.map(({ date, available }) => (
              <div key={date} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ color: available ? '#66cc66' : '#cc6666', fontSize: '0.85rem', width: '16px' }}>{available ? '✓' : '✗'}</span>
                <span style={{ color: available ? '#fff' : '#666', fontSize: '0.9rem' }}>{formatDateShort(date)}</span>
                {!available && <span style={{ color: '#555', fontSize: '0.78rem' }}>not available</span>}
              </div>
            ))}
          </div>
          <div style={{ color: '#999', fontSize: '0.85rem', marginTop: '0.75rem' }}>
            {availableCount} of {recurringWeeks} slots available · <span style={{ color: '#cc0000' }}>{availableCount} tokens</span>
          </div>
        </div>
      )}

      {/* Confirm Booking Bar — appears when a slot is selected */}
      {selectedSlot && (
        <div style={{ background: '#1a1a1a', border: '1px solid #cc0000', borderRadius: '10px', padding: '1.25rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <div style={{ color: '#999', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.25rem' }}>Selected</div>
            <div style={{ color: '#fff', fontWeight: 'bold', fontSize: '1.05rem' }}>
              {formatDate(selectedDate)} at {formatHour(selectedSlot.start_hour)}
            </div>
            {isRecurring && (
              <div style={{ color: '#cc0000', fontSize: '0.8rem', marginTop: '0.2rem' }}>
                🔁 {availableCount} weekly lessons · {availableCount} tokens
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              onClick={() => { setSelectedSlot(null); setMessage('') }}
              disabled={isProcessing}
              style={{ padding: '0.6rem 1.1rem', background: 'transparent', color: '#666', border: '1px solid #444', borderRadius: '6px', cursor: 'pointer', fontSize: '0.9rem' }}
            >
              Clear
            </button>
            <button
              onClick={bookSlot}
              disabled={isProcessing}
              style={{ padding: '0.6rem 1.5rem', background: isProcessing ? '#661111' : '#cc0000', color: '#fff', border: 'none', borderRadius: '6px', cursor: isProcessing ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '0.95rem', opacity: isProcessing ? 0.7 : 1 }}
            >
              {isProcessing ? 'Booking...' : isRecurring ? `Confirm ${availableCount} Bookings` : 'Confirm Booking'}
            </button>
          </div>
        </div>
      )}

      {/* Message */}
      {message && (
        <div style={{ background: '#1a3a1a', border: '1px solid #2a6a2a', borderRadius: '8px', padding: '1rem 1.5rem', marginBottom: '1.5rem' }}>
          <p style={{ margin: 0, color: '#66cc66', fontWeight: 'bold' }}>{message}</p>
        </div>
      )}

      <a href="/dashboard" style={{ color: '#666', textDecoration: 'none', fontSize: '0.9rem' }}>← Back to dashboard</a>
    </main>
  )
}
