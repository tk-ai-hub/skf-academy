'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

function formatHour(h) {
  if (h < 12) return `${h}:00 AM`
  if (h === 12) return `12:00 PM`
  return `${h - 12}:00 PM`
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 10)

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
        users!bookings_student_id_fkey (full_name, email)
      `)
      .eq('status', 'confirmed')
      .order('booked_at', { ascending: false })

    setBookings((bookingData || []).filter(b => b.slots))

    const { data: studentData } = await supabase
      .from('users')
      .select('id, full_name, email, belt_rank')
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

  return (
    <main style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: '700px', margin: '0 auto' }}>
      <h1>SKF Academy — Admin</h1>

      {message && (
        <p style={{ background: '#e6ffe6', padding: '0.75rem', borderRadius: '6px', color: 'green' }}>
          {message}
        </p>
      )}

      <h2>Block Date Range</h2>
      <div style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '1.5rem', marginBottom: '1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 'bold' }}>From</label>
            <input type="date" value={blockStart} onChange={e => setBlockStart(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 'bold' }}>To</label>
            <input type="date" value={blockEnd} onChange={e => setBlockEnd(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }} />
          </div>
        </div>
        <input type="text" placeholder="Reason (e.g. Summer holiday)" value={blockReason}
          onChange={e => setBlockReason(e.target.value)}
          style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px', marginBottom: '1rem', boxSizing: 'border-box' }} />
        <button onClick={blockDates}
          style={{ padding: '0.75rem 1.5rem', background: '#c00', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
          Block These Dates
        </button>
      </div>

      {blockedRanges.length > 0 && (
        <>
          <h3>Currently Blocked Ranges</h3>
          {blockedRanges.map(r => (
            <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #fcc', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '0.5rem', background: '#fff5f5' }}>
              <div>
                <strong>{r.start_date} → {r.end_date}</strong>
                <span style={{ marginLeft: '0.75rem', color: '#666', fontSize: '0.9rem' }}>{r.reason}</span>
              </div>
              <button onClick={() => unblockRange(r)}
                style={{ padding: '0.3rem 0.75rem', background: '#fff', color: '#c00', border: '1px solid #c00', borderRadius: '4px', cursor: 'pointer' }}>
                Unblock
              </button>
            </div>
          ))}
        </>
      )}

      <h2 style={{ marginTop: '2rem' }}>Block Single Time Slot</h2>
      <div style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '1.5rem', marginBottom: '1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 'bold' }}>Date</label>
            <input type="date" value={blockSlotDate} onChange={e => setBlockSlotDate(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 'bold' }}>Time</label>
            <select value={blockSlotHour} onChange={e => setBlockSlotHour(Number(e.target.value))}
              style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}>
              {HOURS.map(h => <option key={h} value={h}>{formatHour(h)}</option>)}
            </select>
          </div>
        </div>
        <input type="text" placeholder="Reason (optional)" value={blockSlotReason}
          onChange={e => setBlockSlotReason(e.target.value)}
          style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px', marginBottom: '1rem', boxSizing: 'border-box' }} />
        <button onClick={blockSingleSlot}
          style={{ padding: '0.75rem 1.5rem', background: '#c00', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
          Block This Slot
        </button>
      </div>

      {blockedSlots.length > 0 && (
        <>
          <h3>Currently Blocked Slots</h3>
          {blockedSlots.map(s => (
            <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #fcc', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '0.5rem', background: '#fff5f5' }}>
              <div>
                <strong>{s.slot_date} at {formatHour(s.start_hour)}</strong>
                {s.block_reason && <span style={{ marginLeft: '0.75rem', color: '#666', fontSize: '0.9rem' }}>{s.block_reason}</span>}
              </div>
              <button onClick={() => unblockSlot(s)}
                style={{ padding: '0.3rem 0.75rem', background: '#fff', color: '#c00', border: '1px solid #c00', borderRadius: '4px', cursor: 'pointer' }}>
                Unblock
              </button>
            </div>
          ))}
        </>
      )}

      <h2 style={{ marginTop: '2rem' }}>Upcoming Bookings</h2>
      {bookings.length === 0 ? (
        <p style={{ color: '#666' }}>No upcoming bookings.</p>
      ) : (
        bookings.map(b => (
          <div key={b.id} style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '1rem', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ margin: 0, fontWeight: 'bold' }}>{b.slots.slot_date} at {formatHour(b.slots.start_hour)}</p>
              <p style={{ margin: '0.25rem 0 0', color: '#666', fontSize: '0.9rem' }}>
                {b.users?.full_name || b.users?.email || 'Unknown student'}
              </p>
            </div>
            <button onClick={() => cancelBooking(b)}
              style={{ padding: '0.4rem 0.9rem', background: '#fff', color: '#c00', border: '1px solid #c00', borderRadius: '4px', cursor: 'pointer' }}>
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
              <button onClick={() => addTokens(s.id, 1)}
                style={{ padding: '0.4rem 0.9rem', background: '#000', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                +1 Token
              </button>
              <button onClick={() => addTokens(s.id, 4)}
                style={{ padding: '0.4rem 0.9rem', background: '#000', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                +4 Tokens
              </button>
            </div>
          </div>
        ))
      )}
    </main>
  )
}