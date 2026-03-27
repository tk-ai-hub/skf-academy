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

// Recurring group classes — not bookable by students
const RECURRING_CLASSES = [
  { dayOfWeek: 2, hour: 18 }, // Tuesday 6PM Kids Class
  { dayOfWeek: 4, hour: 18 }, // Thursday 6PM Kids Class
  { dayOfWeek: 2, hour: 21 }, // Tuesday 9PM Skill Development
  { dayOfWeek: 4, hour: 21 }, // Thursday 9PM Skill Development
]

function isGroupClass(slotDate, startHour) {
  const dow = new Date(slotDate + 'T00:00:00').getDay()
  return RECURRING_CLASSES.some(c => c.dayOfWeek === dow && c.hour === Number(startHour))
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

// Check if a slot is within 24 hours from now
function isWithin24Hours(slotDate, slotHour) {
  const slotTime = new Date(`${slotDate}T${String(slotHour).padStart(2, '0')}:00:00`)
  const now = new Date()
  const diff = slotTime - now
  return diff < 24 * 60 * 60 * 1000 // less than 24 hours away
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
  const [selectedSlot, setSelectedSlot] = useState(null)
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
        .in('status', ['confirmed', 'pending_token'])
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
      const filtered = (data || []).filter(s => !isGroupClass(s.slot_date, s.start_hour))
      setSlots(filtered)
      const dates = [...new Set(filtered.map(s => s.slot_date))]
      setAvailableDates(dates)
      if (dates.length > 0) setSelectedDate(dates[0])
    }
    loadSlots()
  }, [])

  useEffect(() => {
    async function loadBalance() {
      if (!user) return
      const { data } = await supabase.from('tokens').select('amount').eq('student_id', user.id)
      const total = (data || []).reduce((sum, t) => sum + t.amount, 0)
      setBalance(total)
    }
    loadBalance()
  }, [user])

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
  const availableCount = isRecurring && selectedSlot ? recurringPreview.filter(p => p.available).length : 0

  function handleSlotClick(slot) {
    if (isProcessing) return
    // Block booking within 24 hours
    if (isWithin24Hours(slot.slot_date, slot.start_hour)) {
      setMessage('⚠️ Bookings must be made at least 24 hours in advance.')
      return
    }
    setSelectedSlot(prev => prev?.id === slot.id ? null : slot)
    setMessage('')
  }

  async function bookSlot() {
    if (!user || isProcessing || !selectedSlot) return

    // Double-check 24hr rule
    if (isWithin24Hours(selectedSlot.slot_date, selectedSlot.start_hour)) {
      setMessage('⚠️ Bookings must be made at least 24 hours in advance.')
      return
    }

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
          if (s && !bookedIds.includes(s.id) && !isWithin24Hours(date, selectedSlot.start_hour)) availableSlots.push(s)
        }
        if (availableSlots.length === 0) {
          setMessage('No available slots found for this recurring series.')
          return
        }
        const studentName = profile?.first_name ? `${profile.last_name || ''} ${profile.first_name}`.trim() : user.email
        const newBookedIds = []
        let tokensUsed = 0
        let pendingCount = 0
        const groupId = selectedSlot.id + '-' + Date.now()
        let remainingBalance = currentBalance
        for (const s of availableSlots) {
          const hasToken = remainingBalance > 0
          const status = hasToken ? 'confirmed' : 'pending_token'
          const { data: newBooking, error } = await supabase
            .from('bookings')
            .insert({ tenant_id: s.tenant_id, student_id: user.id, slot_id: s.id, status, is_recurring: true, recurring_group_id: groupId })
            .select().single()
          if (!error && newBooking) {
            if (hasToken) {
              await supabase.from('tokens').insert({ tenant_id: s.tenant_id, student_id: user.id, amount: -1, reason: 'recurring lesson booked', booking_id: newBooking.id })
              remainingBalance--
              tokensUsed++
              await fetch('/api/send-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'booking', studentEmail: user.email, studentName, phone: profile?.phone || '', date: s.slot_date, time: formatHour(s.start_hour), hour: s.start_hour }) })
            } else {
              pendingCount++
            }
            newBookedIds.push(s.id)
          }
        }
        setBalance(currentBalance - tokensUsed)
        setBookedIds(prev => [...prev, ...newBookedIds])
        setSelectedSlot(null)
        if (pendingCount > 0) {
          setMessage(`✅ Reserved ${newBookedIds.length} weekly slots at ${formatHour(selectedSlot.start_hour)}. ${tokensUsed} confirmed now, ${pendingCount} will auto-confirm as tokens are added.`)
        } else {
          setMessage(`✅ Booked ${tokensUsed} recurring lesson${tokensUsed > 1 ? 's' : ''} every week at ${formatHour(selectedSlot.start_hour)}!`)
        }
      } else {
        if (currentBalance <= 0) { setMessage('You have no tokens left. Please contact your instructor to add more.'); return }
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

  return (
    <main>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <a href="/dashboard" style={{ color: 'var(--text3)', textDecoration: 'none', fontSize: '0.82rem', letterSpacing: '0.5px' }}>← Dashboard</a>
          <h2 style={{ color: 'var(--text)', margin: '0.3rem 0 0', fontSize: '1.35rem', fontFamily: 'Georgia, serif', letterSpacing: '0.5px' }}>Book a Lesson</h2>
        </div>
        <div className="token-badge" style={{ padding: '0.6rem 1rem', flexDirection: 'column', alignItems: 'center', gap: 0, minWidth: '72px' }}>
          <div style={{ color: 'var(--red)', fontSize: '0.65rem', letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: 600 }}>Tokens</div>
          <div style={{ color: '#fff', fontSize: '1.75rem', fontWeight: 800, lineHeight: 1.1 }}>{balance}</div>
        </div>
      </div>

      {birthdayToday && (
        <div style={{ background: 'linear-gradient(90deg,#2a0000,#1a0000)', border: '1px solid var(--red)', borderRadius: 'var(--radius)', padding: '0.75rem 1.25rem', marginBottom: '1.25rem', textAlign: 'center' }}>
          <p style={{ margin: 0, color: '#ff6666' }}>Happy Birthday{profile?.first_name ? `, ${profile.first_name}` : ''}! 🎂</p>
        </div>
      )}

      {/* Date selector */}
      <span className="section-label">Select a Date</span>
      {availableDates.length === 0 ? (
        <p style={{ color: 'var(--text3)', marginBottom: '1.5rem' }}>No available dates in the next 90 days.</p>
      ) : (
        <div className="date-strip" style={{ marginBottom: '1.5rem' }}>
          {availableDates.map(d => {
            const dt = new Date(d + 'T00:00:00')
            const isActive = d === selectedDate
            const isBday = isBirthday(d, profile?.date_of_birth)
            return (
              <div
                key={d}
                className={`date-card${isActive ? ' active' : ''}`}
                onClick={() => { setSelectedDate(d); setSelectedSlot(null) }}
              >
                <span className="day-name">{dt.toLocaleDateString('en-CA', { weekday: 'short' })}</span>
                <span className="day-num">{dt.getDate()}</span>
                <span className="month">{dt.toLocaleDateString('en-CA', { month: 'short' })}{isBday ? ' 🎂' : ''}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Recurring toggle */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
          <div>
            <div style={{ color: 'var(--text)', fontWeight: 600, fontSize: '0.95rem' }}>Recurring Weekly</div>
            <div style={{ color: 'var(--text3)', fontSize: '0.8rem', marginTop: '0.2rem' }}>Reserve the same time every week</div>
          </div>
          <button
            className="toggle-track"
            onClick={() => { setIsRecurring(!isRecurring); setSelectedSlot(null) }}
            style={{ background: isRecurring ? 'var(--red)' : 'var(--border2)' }}
          >
            <div className="toggle-thumb" style={{ left: isRecurring ? '25px' : '3px' }} />
          </button>
        </div>
        {isRecurring && (
          <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
            <span className="section-label">Number of Weeks</span>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {[4, 8, 12, 16, 24].map(w => (
                <button
                  key={w}
                  onClick={() => setRecurringWeeks(w)}
                  style={{ padding: '0.45rem 1rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600, background: recurringWeeks === w ? 'var(--red)' : 'var(--bg)', color: '#fff', border: `1.5px solid ${recurringWeeks === w ? 'var(--red)' : 'var(--border2)'}`, transition: 'all 0.15s' }}
                >
                  {w}w
                </button>
              ))}
            </div>
            <p style={{ color: 'var(--text3)', fontSize: '0.8rem', margin: '0.75rem 0 0' }}>
              Select a time below · slots beyond your current tokens are reserved automatically
            </p>
          </div>
        )}
      </div>

      {/* Time slots */}
      <span className="section-label">Available Times — {selectedDate && new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.6rem', marginBottom: '1.5rem' }}>
        {slotsForDate.map(slot => {
          const isSelected = selectedSlot?.id === slot.id
          const blocked = isWithin24Hours(slot.slot_date, slot.start_hour)
          return (
            <button
              key={slot.id}
              className={`slot-btn${isSelected ? ' selected' : ''}${blocked ? ' blocked' : ''}`}
              onClick={() => handleSlotClick(slot)}
              disabled={isProcessing || blocked}
              title={blocked ? 'Cannot book within 24 hours' : ''}
            >
              {formatHour(slot.start_hour)}
              {blocked && <div style={{ fontSize: '0.6rem', marginTop: '2px', opacity: 0.7 }}>24hr limit</div>}
            </button>
          )
        })}
        {slotsForDate.length === 0 && (
          <p style={{ color: 'var(--text3)', gridColumn: '1 / -1', margin: 0, fontSize: '0.9rem' }}>No available times for this date.</p>
        )}
      </div>

      {/* Recurring preview */}
      {isRecurring && selectedSlot && recurringPreview.length > 0 && (
        <div className="card" style={{ marginBottom: '1.25rem', border: '1px solid var(--border2)' }}>
          <div style={{ color: 'var(--text)', fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
            Weekly Schedule — {formatHour(selectedSlot.start_hour)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem' }}>
            {recurringPreview.map(({ date, available }) => (
              <div key={date} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.3rem 0' }}>
                <span style={{ color: available ? 'var(--green)' : '#555', fontSize: '0.8rem', width: '14px', flexShrink: 0 }}>{available ? '✓' : '✗'}</span>
                <span style={{ color: available ? 'var(--text)' : 'var(--text3)', fontSize: '0.85rem' }}>{formatDateShort(date)}</span>
              </div>
            ))}
          </div>
          <div style={{ color: 'var(--text3)', fontSize: '0.82rem', marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
            {availableCount} confirmed now
            {recurringWeeks - availableCount > 0 && <span style={{ color: 'var(--gold)', marginLeft: '0.5rem' }}>· {recurringWeeks - availableCount} reserved (pending token)</span>}
          </div>
        </div>
      )}

      {/* Confirm bar */}
      {selectedSlot && (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--red)', borderRadius: 'var(--radius)', padding: '1rem 1.25rem', marginBottom: '1.5rem', boxShadow: '0 0 20px var(--red-glow)' }}>
          <div style={{ color: 'var(--text3)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.3rem' }}>Your Selection</div>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: '1.05rem', marginBottom: '0.75rem' }}>
            {formatDate(selectedDate)} · {formatHour(selectedSlot.start_hour)}
            {isRecurring && <span style={{ color: 'var(--red)', fontWeight: 400, fontSize: '0.85rem', marginLeft: '0.5rem' }}>× {recurringWeeks} weeks</span>}
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button onClick={() => { setSelectedSlot(null); setMessage('') }} disabled={isProcessing} className="btn-secondary" style={{ width: 'auto', padding: '0.65rem 1.1rem', fontSize: '0.85rem' }}>Clear</button>
            <button onClick={bookSlot} disabled={isProcessing} className="btn-primary" style={{ flex: 1, padding: '0.75rem' }}>
              {isProcessing ? 'Booking...' : isRecurring ? `Reserve ${recurringWeeks} Weeks` : 'Confirm Booking'}
            </button>
          </div>
        </div>
      )}

      {message && (
        <div style={{ background: message.includes('⚠️') ? '#2a1a00' : '#0d2a14', border: `1px solid ${message.includes('⚠️') ? '#aa6600' : '#1a5a2a'}`, borderRadius: 'var(--radius)', padding: '1rem 1.25rem', marginBottom: '1.5rem' }}>
          <p style={{ margin: 0, color: message.includes('⚠️') ? '#ffaa44' : '#4ade80', fontSize: '0.95rem' }}>{message}</p>
        </div>
      )}
    </main>
  )
}
