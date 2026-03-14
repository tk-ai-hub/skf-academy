'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

function formatHour(h) {
  if (h < 12) return `${h}:00 AM`
  if (h === 12) return `12:00 PM`
  return `${h - 12}:00 PM`
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 10)

function getUpcomingBirthdays(students) {
  const today = new Date()
  const in30 = new Date()
  in30.setDate(today.getDate() + 30)

  return students.filter(s => {
    if (!s.date_of_birth) return false
    const [, bMonth, bDay] = s.date_of_birth.split('-').map(Number)
    const thisYear = new Date(today.getFullYear(), bMonth - 1, bDay)
    const nextYear = new Date(today.getFullYear() + 1, bMonth - 1, bDay)
    const upcoming = thisYear >= today ? thisYear : nextYear
    return upcoming <= in30
  }).map(s => {
    const [, bMonth, bDay] = s.date_of_birth.split('-').map(Number)
    const thisYear = new Date(new Date().getFullYear(), bMonth - 1, bDay)
    const nextYear = new Date(new Date().getFullYear() + 1, bMonth - 1, bDay)
    const upcoming = thisYear >= new Date() ? thisYear : nextYear
    return { ...s, upcomingBirthday: upcoming }
  }).sort((a, b) => a.upcomingBirthday - b.upcomingBirthday)
}

export default function Admin() {
  const [bookings, setBookings] = useState([])
  const [students, setStudents] = useState([])
  const [message, setMessage] = useState('')
  const [blockStart, setBlockStart] = useState('')
  const [blockEnd, setBlockEnd] = useState('')
  const [blockReason, setBlockReason] = useState('')
  const [blockedRanges, setBlockedRanges] = useState([])
  const [blockedSlots, setBlockedSlots] = useState([])
  const [blockSlotDate, setBlockSlotDate] = useState('')
  const [blockSlotHour, setBlockSlotHour] = useState(10)
  const [blockSlotReason, setBlockSlotReason] = useState('')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: bookingData } = await supabase
      .from('bookings')
      .select(`
        id, status, booked_at, tenant_id, student_id,
        slots!bookings_slot_id_fkey (id, slot_date, start_hour),
        users!bookings_student_id_fkey (full_name, first_name, last_name, email)
      `)
      .eq('status', 'confirmed')
      .order('booked_at', { ascending: false })

    setBookings((bookingData || []).filter(b => b.slots))

    const { data: studentData } = await supabase
      .from('users')
      .select('id, full_name, first_name, last_name, email, belt_rank, date_of_birth')
      .eq('role', 'student')

    setStudents(studentData || [])

    const { data: rangeData } = await supabase
      .from('blocked_ranges')
      .select('*')
      .order('start_date', { ascending: true })

    setBlockedRanges(rangeData || [])

    const { data: slotData } = await supabase
      .from('slots')
      .select('id, slot_date, start_hour, block_reason')
      .eq('is_blocked', true)
      .gte('slot_date', new Date().toISOString().split('T')[0])
      .order('slot_date', { ascending: true })
      .order('start_hour', { ascending: true })

    const rangeSlots = slotData?.filter(slot => {
      return !rangeData?.some(r => slot.slot_date >= r.start_date && slot.slot_date <= r.end_date)
    }) || []

    setBlockedSlots(rangeSlots)
  }

  async function cancelBooking(booking) {
    await supabase.from('bookings')
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
      .from('tenants').select('id').eq('slug', 'skf-academy').single()
    await supabase.from('tokens').insert({
      tenant_id: tenant.id,
      student_id: studentId,
      amount,
      reason: 'added by admin'
    })
    setMessage(`${amount} token(s) added successfully.`)
  }

  async function blockDates() {
    if (!blockStart || !blockEnd) { setMessage('Please select a start and end date.'); return }
    const { data: tenant } = await supabase
      .from('tenants').select('id').eq('slug', 'skf-academy').single()
    await supabase.from('blocked_ranges').insert({
      tenant_id: tenant.id,
      start_date: blockStart,
      end_date: blockEnd,
      reason: blockReason || 'Unavailable'
    })
    await supabase.from('slots')
      .update({ is_blocked: true, block_reason: blockReason || 'Unavailable' })
      .gte('slot_date', blockStart)
      .lte('slot_date', blockEnd)
    setMessage(`Dates blocked from ${blockStart} to ${blockEnd}.`)
    setBlockStart(''); setBlockEnd(''); setBlockReason('')
    loadData()
  }

  async function unblockRange(range) {
    await supabase.from('blocked_ranges').delete().eq('id', range.id)
    await supabase.from('slots')
      .update({ is_blocked: false, block_reason: null })
      .gte('slot_date', range.start_date)
      .lte('slot_date', range.end_date)
    setMessage('Dates unblocked.')
    loadData()
  }

  async function blockSingleSlot() {
    if (!blockSlotDate) { setMessage('Please select a date.'); return }
    await supabase.from('slots')
      .update({ is_blocked: true, block_reason: blockSlotReason || 'Unavailable' })
      .eq('slot_date', blockSlotDate)
      .eq('start_hour', blockSlotHour)
    setMessage(`${blockSlotDate} at ${formatHour(blockSlotHour)} blocked.`)
    setBlockSlotDate(''); setBlockSlotReason('')
    loadData()
  }

  async function unblockSlot(slot) {
    await supabase.from('slots')
      .update({ is_blocked: false, block_reason: null })
      .eq('id', slot.id)
    setMessage(`${slot.slot_date} at ${formatHour(slot.start_hour)} unblocked.`)
    loadData()
  }

  const upcomingBirthdays = getUpcomingBirthdays(students)

  function studentName(s) {
    if (s?.first_name) return `${s.first_name} ${s.last_name || ''}`.trim()
    return s?.email || 'Unknown'
  }

  return (
    <main style={{ fontFamily: 'sans-serif', maxWidth: '700px', margin: '0 auto' }}>
      <h1 style={{ color: '#fff', borderBottom: '2px solid #cc0000', paddingBottom: '0.5rem' }}>SKF Academy — Admin</h1>

      {message && (
        <p style={{ background: '#1a3a1a', border: '1px solid #2a6a2a', padding: '0.75rem', borderRadius: '6px', color: '#66cc66' }}>
          {message}
        </p>
      )}

      {/* Upcoming Birthdays */}
      {upcomingBirthdays.length > 0 && (
        <>
          <h2 style={{ color: '#fff' }}>🎂 Upcoming Birthdays</h2>
          {upcomingBirthdays.map(s => (
            <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#2a1a1a', border: '1px solid #cc0000', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '0.5rem' }}>
              <strong style={{ color: '#fff' }}>{studentName(s)}</strong>
              <span style={{ color: '#cc0000' }}>
                🎂 {s.upcomingBirthday.toLocaleDateString('en-CA', { month: 'long', day: 'numeric' })}
              </span>
            </div>
          ))}
        </>
      )}

      {/* Block Date Range */}
      <h2 style={{ color: '#fff' }}>Block Date Range</h2>
      <div style={{ border: '1px solid #333', borderRadius: '8px', padding: '1.5rem', marginBottom: '1rem', background: '#2a2a2a' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.25rem', color: '#999', fontSize: '0.8rem', textTransform: 'uppercase' }}>From</label>
            <input type="date" value={blockStart} onChange={e => setBlockStart(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', background: '#1a1a1a', border: '1px solid #444', borderRadius: '4px', color: '#fff' }} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.25rem', color: '#999', fontSize: '0.8rem', textTransform: 'uppercase' }}>To</label>
            <input type="date" value={blockEnd} onChange={e => setBlockEnd(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', background: '#1a1a1a', border: '1px solid #444', borderRadius: '4px', color: '#fff' }} />
          </div>
        </div>
        <input type="text" placeholder="Reason (e.g. Summer holiday)" value={blockReason}
          onChange={e => setBlockReason(e.target.value)}
          style={{ width: '100%', padding: '0.5rem', background: '#1a1a1a', border: '1px solid #444', borderRadius: '4px', color: '#fff', marginBottom: '1rem', boxSizing: 'border-box' }} />
        <button onClick={blockDates}
          style={{ padding: '0.75rem 1.5rem', background: '#cc0000', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
          Block These Dates
        </button>
      </div>

      {blockedRanges.length > 0 && (
        <>
          <h3 style={{ color: '#fff' }}>Currently Blocked Ranges</h3>
          {blockedRanges.map(r => (
            <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #cc0000', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '0.5rem', background: '#2a1a1a' }}>
              <div>
                <strong style={{ color: '#fff' }}>{r.start_date} → {r.end_date}</strong>
                <span style={{ marginLeft: '0.75rem', color: '#666', fontSize: '0.9rem' }}>{r.reason}</span>
              </div>
              <button onClick={() => unblockRange(r)}
                style={{ padding: '0.3rem 0.75rem', background: 'transparent', color: '#cc0000', border: '1px solid #cc0000', borderRadius: '4px', cursor: 'pointer' }}>
                Unblock
              </button>
            </div>
          ))}
        </>
      )}

      {/* Block Single Slot */}
      <h2 style={{ color: '#fff', marginTop: '2rem' }}>Block Single Time Slot</h2>
      <div style={{ border: '1px solid #333', borderRadius: '8px', padding: '1.5rem', marginBottom: '1rem', background: '#2a2a2a' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.25rem', color: '#999', fontSize: '0.8rem', textTransform: 'uppercase' }}>Date</label>
            <input type="date" value={blockSlotDate} onChange={e => setBlockSlotDate(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', background: '#1a1a1a', border: '1px solid #444', borderRadius: '4px', color: '#fff' }} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.25rem', color: '#999', fontSize: '0.8rem', textTransform: 'uppercase' }}>Time</label>
            <select value={blockSlotHour} onChange={e => setBlockSlotHour(Number(e.target.value))}
              style={{ width: '100%', padding: '0.5rem', background: '#1a1a1a', border: '1px solid #444', borderRadius: '4px', color: '#fff' }}>
              {HOURS.map(h => <option key={h} value={h}>{formatHour(h)}</option>)}
            </select>
          </div>
        </div>
        <input type="text" placeholder="Reason (optional)" value={blockSlotReason}
          onChange={e => setBlockSlotReason(e.target.value)}
          style={{ width: '100%', padding: '0.5rem', background: '#1a1a1a', border: '1px solid #444', borderRadius: '4px', color: '#fff', marginBottom: '1rem', boxSizing: 'border-box' }} />
        <button onClick={blockSingleSlot}
          style={{ padding: '0.75rem 1.5rem', background: '#cc0000', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
          Block This Slot
        </button>
      </div>

      {blockedSlots.length > 0 && (
        <>
          <h3 style={{ color: '#fff' }}>Currently Blocked Slots</h3>
          {blockedSlots.map(s => (
            <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #cc0000', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '0.5rem', background: '#2a1a1a' }}>
              <div>
                <strong style={{ color: '#fff' }}>{s.slot_date} at {formatHour(s.start_hour)}</strong>
                {s.block_reason && <span style={{ marginLeft: '0.75rem', color: '#666', fontSize: '0.9rem' }}>{s.block_reason}</span>}
              </div>
              <button onClick={() => unblockSlot(s)}
                style={{ padding: '0.3rem 0.75rem', background: 'transparent', color: '#cc0000', border: '1px solid #cc0000', borderRadius: '4px', cursor: 'pointer' }}>
                Unblock
              </button>
            </div>
          ))}
        </>
      )}

      {/* Upcoming Bookings */}
      <h2 style={{ color: '#fff', marginTop: '2rem' }}>Upcoming Bookings</h2>
      {bookings.length === 0 ? (
        <p style={{ color: '#666' }}>No upcoming bookings.</p>
      ) : (
        bookings.map(b => (
          <div key={b.id} style={{ border: '1px solid #333', borderRadius: '8px', padding: '1rem', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#2a2a2a' }}>
            <div>
              <p style={{ margin: 0, fontWeight: 'bold', color: '#fff' }}>{b.slots.slot_date} at {formatHour(b.slots.start_hour)}</p>
              <p style={{ margin: '0.25rem 0 0', color: '#666', fontSize: '0.9rem' }}>
                {studentName(b.users)}
              </p>
            </div>
            <button onClick={() => cancelBooking(b)}
              style={{ padding: '0.4rem 0.9rem', background: 'transparent', color: '#cc0000', border: '1px solid #cc0000', borderRadius: '4px', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        ))
      )}

      {/* Students */}
      <h2 style={{ color: '#fff', marginTop: '2rem' }}>Students</h2>
      {students.length === 0 ? (
        <p style={{ color: '#666' }}>No students yet.</p>
      ) : (
        students.map(s => (
          <div key={s.id} style={{ border: '1px solid #333', borderRadius: '8px', padding: '1rem', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#2a2a2a' }}>
            <div>
              <p style={{ margin: 0, fontWeight: 'bold', color: '#fff' }}>{studentName(s)}</p>
              <p style={{ margin: '0.25rem 0 0', color: '#666', fontSize: '0.9rem' }}>
                {s.belt_rank} belt
                {s.date_of_birth && <span style={{ marginLeft: '0.75rem' }}>🎂 {s.date_of_birth}</span>}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={() => addTokens(s.id, 1)}
                style={{ padding: '0.4rem 0.9rem', background: '#cc0000', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                +1
              </button>
              <button onClick={() => addTokens(s.id, 4)}
                style={{ padding: '0.4rem 0.9rem', background: '#cc0000', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                +4
              </button>
            </div>
          </div>
        ))
      )}
    </main>
  )
}