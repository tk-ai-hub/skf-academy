'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

function formatHour(h) {
  if (h < 12) return `${h}:00 AM`
  if (h === 12) return `12:00 PM`
  return `${h - 12}:00 PM`
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 10)
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAY_NAMES_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function getWeekDates(referenceDate) {
  const d = new Date(referenceDate)
  const day = d.getDay() // 0 = Sunday
  const monday = new Date(d)
  monday.setDate(d.getDate() - ((day + 6) % 7)) // shift to Monday
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(monday)
    date.setDate(monday.getDate() + i)
    return date.toISOString().split('T')[0]
  })
}

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

function studentName(s) {
  if (s?.first_name) return `${s.first_name} ${s.last_name || ''}`.trim()
  return s?.email || 'Unknown'
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

  // Weekly calendar state
  const [activeTab, setActiveTab] = useState('week') // 'week' | 'bookings' | 'students' | 'block'
  const [weekOffset, setWeekOffset] = useState(0)

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
      tenant_id: tenant.id, start_date: blockStart, end_date: blockEnd,
      reason: blockReason || 'Unavailable'
    })
    await supabase.from('slots')
      .update({ is_blocked: true, block_reason: blockReason || 'Unavailable' })
      .gte('slot_date', blockStart).lte('slot_date', blockEnd)
    setMessage(`Dates blocked from ${blockStart} to ${blockEnd}.`)
    setBlockStart(''); setBlockEnd(''); setBlockReason('')
    loadData()
  }

  async function unblockRange(range) {
    await supabase.from('blocked_ranges').delete().eq('id', range.id)
    await supabase.from('slots')
      .update({ is_blocked: false, block_reason: null })
      .gte('slot_date', range.start_date).lte('slot_date', range.end_date)
    setMessage('Dates unblocked.')
    loadData()
  }

  async function blockSingleSlot() {
    if (!blockSlotDate) { setMessage('Please select a date.'); return }
    await supabase.from('slots')
      .update({ is_blocked: true, block_reason: blockSlotReason || 'Unavailable' })
      .eq('slot_date', blockSlotDate).eq('start_hour', blockSlotHour)
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

  // --- Weekly Calendar Logic ---
  const today = new Date()
  const referenceDate = new Date(today)
  referenceDate.setDate(today.getDate() + weekOffset * 7)
  const weekDates = getWeekDates(referenceDate.toISOString().split('T')[0])
  const weekStart = weekDates[0]
  const weekEnd = weekDates[6]

  const weekBookings = bookings.filter(b =>
    b.slots?.slot_date >= weekStart && b.slots?.slot_date <= weekEnd
  )

  function getBookingForCell(date, hour) {
    return weekBookings.find(b => b.slots?.slot_date === date && b.slots?.start_hour === hour)
  }

  function formatWeekLabel() {
    const s = new Date(weekStart + 'T00:00:00')
    const e = new Date(weekEnd + 'T00:00:00')
    const opts = { month: 'short', day: 'numeric' }
    return `${s.toLocaleDateString('en-CA', opts)} – ${e.toLocaleDateString('en-CA', opts)}, ${e.getFullYear()}`
  }

  const upcomingBirthdays = getUpcomingBirthdays(students)

  const tabStyle = (tab) => ({
    padding: '0.5rem 1.1rem',
    background: activeTab === tab ? '#cc0000' : '#2a2a2a',
    color: '#fff',
    border: activeTab === tab ? '1px solid #cc0000' : '1px solid #444',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '0.85rem',
    fontWeight: activeTab === tab ? 'bold' : 'normal',
    letterSpacing: '0.5px'
  })

  return (
    <main style={{ fontFamily: 'sans-serif', maxWidth: '900px', margin: '0 auto' }}>
      <h1 style={{ color: '#fff', borderBottom: '2px solid #cc0000', paddingBottom: '0.5rem' }}>SKF Academy — Admin</h1>

      {message && (
        <p style={{ background: '#1a3a1a', border: '1px solid #2a6a2a', padding: '0.75rem', borderRadius: '6px', color: '#66cc66' }}>
          {message}
        </p>
      )}

      {/* Tab Nav */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
        <button style={tabStyle('week')} onClick={() => setActiveTab('week')}>📅 Week View</button>
        <button style={tabStyle('bookings')} onClick={() => setActiveTab('bookings')}>📋 All Bookings</button>
        <button style={tabStyle('students')} onClick={() => setActiveTab('students')}>👥 Students</button>
        <button style={tabStyle('block')} onClick={() => setActiveTab('block')}>🔒 Block Dates</button>
      </div>

      {/* ── WEEK VIEW TAB ── */}
      {activeTab === 'week' && (
        <div>
          {/* Week Navigator */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
            <button
              onClick={() => setWeekOffset(w => w - 1)}
              style={{ padding: '0.4rem 1rem', background: '#2a2a2a', color: '#fff', border: '1px solid #444', borderRadius: '6px', cursor: 'pointer' }}
            >← Prev</button>
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: '#fff', fontWeight: 'bold', fontSize: '1rem' }}>{formatWeekLabel()}</div>
              {weekOffset === 0 && <div style={{ color: '#cc0000', fontSize: '0.75rem', marginTop: '2px' }}>THIS WEEK</div>}
            </div>
            <button
              onClick={() => setWeekOffset(w => w + 1)}
              style={{ padding: '0.4rem 1rem', background: '#2a2a2a', color: '#fff', border: '1px solid #444', borderRadius: '6px', cursor: 'pointer' }}
            >Next →</button>
          </div>

          {/* Weekly summary strip */}
          <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1.25rem', justifyContent: 'center' }}>
            {weekDates.map((date, i) => {
              const dayBookings = weekBookings.filter(b => b.slots?.slot_date === date)
              const isToday = date === today.toISOString().split('T')[0]
              return (
                <div key={date} style={{
                  flex: 1, textAlign: 'center', padding: '0.4rem 0.2rem',
                  background: isToday ? '#3a0000' : '#2a2a2a',
                  border: isToday ? '1px solid #cc0000' : '1px solid #333',
                  borderRadius: '6px'
                }}>
                  <div style={{ color: '#999', fontSize: '0.7rem', textTransform: 'uppercase' }}>{DAY_NAMES[new Date(date + 'T00:00:00').getDay()]}</div>
                  <div style={{ color: '#fff', fontSize: '0.9rem', fontWeight: 'bold' }}>{new Date(date + 'T00:00:00').getDate()}</div>
                  {dayBookings.length > 0 && (
                    <div style={{ background: '#cc0000', borderRadius: '10px', color: '#fff', fontSize: '0.65rem', marginTop: '2px', padding: '1px 5px', display: 'inline-block' }}>
                      {dayBookings.length}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Calendar Grid */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
              <thead>
                <tr>
                  <th style={{ width: '70px', color: '#666', fontSize: '0.75rem', textTransform: 'uppercase', padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid #333' }}>Time</th>
                  {weekDates.map((date, i) => {
                    const isToday = date === today.toISOString().split('T')[0]
                    return (
                      <th key={date} style={{
                        color: isToday ? '#cc0000' : '#ccc',
                        fontSize: '0.78rem', textTransform: 'uppercase',
                        padding: '0.5rem 0.3rem', textAlign: 'center',
                        borderBottom: '1px solid #333',
                        background: isToday ? '#1a0000' : 'transparent'
                      }}>
                        <div>{DAY_NAMES_FULL[new Date(date + 'T00:00:00').getDay()]}</div>
                        <div style={{ fontSize: '1rem', fontWeight: 'bold', color: isToday ? '#cc0000' : '#fff' }}>
                          {new Date(date + 'T00:00:00').getDate()}
                        </div>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {HOURS.map(hour => (
                  <tr key={hour}>
                    <td style={{ color: '#555', fontSize: '0.75rem', padding: '0.4rem 0.5rem', borderBottom: '1px solid #1f1f1f', whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                      {formatHour(hour)}
                    </td>
                    {weekDates.map(date => {
                      const booking = getBookingForCell(date, hour)
                      const isToday = date === today.toISOString().split('T')[0]
                      return (
                        <td key={date} style={{
                          padding: '0.3rem',
                          borderBottom: '1px solid #1f1f1f',
                          background: isToday ? '#0d0000' : 'transparent',
                          verticalAlign: 'top',
                          minHeight: '48px'
                        }}>
                          {booking ? (
                            <div style={{
                              background: '#2a0000',
                              border: '1px solid #cc0000',
                              borderRadius: '5px',
                              padding: '0.3rem 0.4rem',
                              cursor: 'default'
                            }}>
                              <div style={{ color: '#fff', fontSize: '0.78rem', fontWeight: 'bold', lineHeight: 1.3 }}>
                                {studentName(booking.users)}
                              </div>
                              <div style={{ color: '#cc0000', fontSize: '0.68rem', marginTop: '2px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                Private Lesson
                              </div>
                              <button
                                onClick={() => cancelBooking(booking)}
                                style={{
                                  marginTop: '4px', padding: '1px 5px', fontSize: '0.65rem',
                                  background: 'transparent', color: '#884444',
                                  border: '1px solid #442222', borderRadius: '3px', cursor: 'pointer'
                                }}
                              >cancel</button>
                            </div>
                          ) : (
                            <div style={{ height: '42px' }} />
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {weekBookings.length === 0 && (
            <p style={{ color: '#555', textAlign: 'center', marginTop: '1.5rem' }}>No bookings this week.</p>
          )}
        </div>
      )}

      {/* ── ALL BOOKINGS TAB ── */}
      {activeTab === 'bookings' && (
        <div>
          <h2 style={{ color: '#fff', marginTop: 0 }}>Upcoming Bookings</h2>
          {bookings.length === 0 ? (
            <p style={{ color: '#666' }}>No upcoming bookings.</p>
          ) : (
            bookings.map(b => (
              <div key={b.id} style={{ border: '1px solid #333', borderRadius: '8px', padding: '1rem', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#2a2a2a' }}>
                <div>
                  <p style={{ margin: 0, fontWeight: 'bold', color: '#fff' }}>{b.slots.slot_date} at {formatHour(b.slots.start_hour)}</p>
                  <p style={{ margin: '0.25rem 0 0', color: '#cc0000', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Private Lesson</p>
                  <p style={{ margin: '0.15rem 0 0', color: '#888', fontSize: '0.85rem' }}>{studentName(b.users)}</p>
                </div>
                <button
                  onClick={() => cancelBooking(b)}
                  style={{ padding: '0.4rem 0.9rem', background: 'transparent', color: '#cc0000', border: '1px solid #cc0000', borderRadius: '4px', cursor: 'pointer' }}
                >Cancel</button>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── STUDENTS TAB ── */}
      {activeTab === 'students' && (
        <div>
          {upcomingBirthdays.length > 0 && (
            <>
              <h2 style={{ color: '#fff', marginTop: 0 }}>🎂 Upcoming Birthdays</h2>
              {upcomingBirthdays.map(s => (
                <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#2a1a1a', border: '1px solid #cc0000', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '0.5rem' }}>
                  <strong style={{ color: '#fff' }}>{studentName(s)}</strong>
                  <span style={{ color: '#cc0000' }}>🎂 {s.upcomingBirthday.toLocaleDateString('en-CA', { month: 'long', day: 'numeric' })}</span>
                </div>
              ))}
            </>
          )}

          <h2 style={{ color: '#fff' }}>Students</h2>
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
                  <button onClick={() => addTokens(s.id, 1)} style={{ padding: '0.4rem 0.9rem', background: '#cc0000', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>+1</button>
                  <button onClick={() => addTokens(s.id, 4)} style={{ padding: '0.4rem 0.9rem', background: '#cc0000', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>+4</button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── BLOCK DATES TAB ── */}
      {activeTab === 'block' && (
        <div>
          <h2 style={{ color: '#fff', marginTop: 0 }}>Block Date Range</h2>
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
            <input type="text" placeholder="Reason (e.g. Summer holiday)" value={blockReason} onChange={e => setBlockReason(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', background: '#1a1a1a', border: '1px solid #444', borderRadius: '4px', color: '#fff', marginBottom: '1rem', boxSizing: 'border-box' }} />
            <button onClick={blockDates} style={{ padding: '0.75rem 1.5rem', background: '#cc0000', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
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
                  <button onClick={() => unblockRange(r)} style={{ padding: '0.3rem 0.75rem', background: 'transparent', color: '#cc0000', border: '1px solid #cc0000', borderRadius: '4px', cursor: 'pointer' }}>Unblock</button>
                </div>
              ))}
            </>
          )}

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
            <input type="text" placeholder="Reason (optional)" value={blockSlotReason} onChange={e => setBlockSlotReason(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', background: '#1a1a1a', border: '1px solid #444', borderRadius: '4px', color: '#fff', marginBottom: '1rem', boxSizing: 'border-box' }} />
            <button onClick={blockSingleSlot} style={{ padding: '0.75rem 1.5rem', background: '#cc0000', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
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
                  <button onClick={() => unblockSlot(s)} style={{ padding: '0.3rem 0.75rem', background: 'transparent', color: '#cc0000', border: '1px solid #cc0000', borderRadius: '4px', cursor: 'pointer' }}>Unblock</button>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </main>
  )
}
