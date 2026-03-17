'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

function formatHour(h) {
  if (h < 12) return `${h}:00 AM`
  if (h === 12) return `12:00 PM`
  return `${h - 12}:00 PM`
}

const BELT_RANKS = ['white', 'yellow', 'orange', 'green', 'blue', 'brown', 'black']
const BELT_COLORS = { white: '#eee', yellow: '#f5c518', orange: '#e87722', green: '#2d8a4e', blue: '#1a5fa8', brown: '#7b4f2e', black: '#222' }
const HOURS = Array.from({ length: 12 }, (_, i) => i + 10)
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAY_NAMES_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function getWeekDates(referenceDate) {
  const d = new Date(referenceDate)
  const day = d.getDay()
  const monday = new Date(d)
  monday.setDate(d.getDate() - ((day + 6) % 7))
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

function sName(s) {
  if (s?.first_name) return `${s.first_name} ${s.last_name || ''}`.trim()
  return s?.email || 'Unknown'
}

function isWithin24Hours(slotDate, slotHour) {
  const slotTime = new Date(`${slotDate}T${String(slotHour).padStart(2, '0')}:00:00`)
  return (slotTime - new Date()) < 24 * 60 * 60 * 1000
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
  const [activeTab, setActiveTab] = useState('week')
  const [weekOffset, setWeekOffset] = useState(0)

  // Student profile
  const [selectedStudent, setSelectedStudent] = useState(null)
  const [studentTokens, setStudentTokens] = useState(0)
  const [studentBookings, setStudentBookings] = useState([])
  const [profileLoading, setProfileLoading] = useState(false)
  const [editingRank, setEditingRank] = useState(false)

  // Email
  const [selectedStudentIds, setSelectedStudentIds] = useState([])
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [emailSending, setEmailSending] = useState(false)
  const [showEmailCompose, setShowEmailCompose] = useState(false)

  // Admin route protection
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data?.user) { window.location.href = '/admin-login'; return }
      const { data: profile } = await supabase.from('users').select('role').eq('id', data.user.id).single()
      if (profile?.role !== 'admin') { await supabase.auth.signOut(); window.location.href = '/admin-login'; return }
    })
  }, [])

  useEffect(() => { loadData() }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = '/admin-login'
  }

  async function loadData() {
    const { data: bookingData } = await supabase
      .from('bookings')
      .select(`id, status, booked_at, tenant_id, student_id, attendance, slots!bookings_slot_id_fkey (id, slot_date, start_hour), users!bookings_student_id_fkey (full_name, first_name, last_name, email)`)
      .eq('status', 'confirmed')
      .order('booked_at', { ascending: false })
    setBookings((bookingData || []).filter(b => b.slots))

    const { data: studentData } = await supabase
      .from('users')
      .select('id, full_name, first_name, last_name, email, phone, belt_rank, date_of_birth')
      .eq('role', 'student')
      .order('first_name', { ascending: true })
    setStudents(studentData || [])

    const { data: rangeData } = await supabase.from('blocked_ranges').select('*').order('start_date', { ascending: true })
    setBlockedRanges(rangeData || [])

    const { data: slotData } = await supabase.from('slots').select('id, slot_date, start_hour, block_reason')
      .eq('is_blocked', true).gte('slot_date', new Date().toISOString().split('T')[0])
      .order('slot_date', { ascending: true }).order('start_hour', { ascending: true })
    const rangeSlots = slotData?.filter(slot => !rangeData?.some(r => slot.slot_date >= r.start_date && slot.slot_date <= r.end_date)) || []
    setBlockedSlots(rangeSlots)
  }

  async function openStudentProfile(student) {
    setSelectedStudent(student)
    setEditingRank(false)
    setProfileLoading(true)
    const { data: tokenData } = await supabase.from('tokens').select('amount').eq('student_id', student.id)
    setStudentTokens((tokenData || []).reduce((sum, t) => sum + t.amount, 0))
    const { data: bData } = await supabase
      .from('bookings')
      .select(`id, status, attendance, booked_at, slots!bookings_slot_id_fkey (slot_date, start_hour)`)
      .eq('student_id', student.id)
      .order('booked_at', { ascending: false })
      .limit(20)
    setStudentBookings((bData || []).filter(b => b.slots))
    setProfileLoading(false)
  }

  async function updateBeltRank(studentId, newRank) {
    await supabase.from('users').update({ belt_rank: newRank }).eq('id', studentId)
    setStudents(prev => prev.map(s => s.id === studentId ? { ...s, belt_rank: newRank } : s))
    setSelectedStudent(prev => prev ? { ...prev, belt_rank: newRank } : prev)
    setEditingRank(false)
    setMessage(`Belt rank updated to ${newRank}.`)
  }

  async function markAttendance(bookingId, attendance) {
    await supabase.from('bookings').update({ attendance }).eq('id', bookingId)
    setStudentBookings(prev => prev.map(b => b.id === bookingId ? { ...b, attendance } : b))
    // Also update main bookings list
    setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, attendance } : b))
    setMessage(attendance === 'dns' ? 'Marked as DNS — token kept.' : 'Marked as attended.')
  }

  async function cancelBooking(booking) {
    const within24 = isWithin24Hours(booking.slots?.slot_date, booking.slots?.start_hour)
    await supabase.from('bookings').update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancelled_by: 'admin', cancelled_within_24h: within24 }).eq('id', booking.id)
    // Remove from local state immediately so calendar updates right away
    setBookings(prev => prev.filter(b => b.id !== booking.id))
    // Only refund if NOT within 24 hours
    if (!within24) {
      await supabase.from('tokens').insert({ tenant_id: booking.tenant_id, student_id: booking.student_id, amount: 1, reason: 'cancelled by admin - refund', booking_id: booking.id })
      setMessage('Booking cancelled and token refunded.')
    } else {
      setMessage('Booking cancelled. No token refund — within 24 hours.')
    }
    if (selectedStudent) openStudentProfile(selectedStudent)
  }

  async function addTokens(studentId, amount) {
    const { data: tenant } = await supabase.from('tenants').select('id').eq('slug', 'skf-academy').single()
    await supabase.from('tokens').insert({ tenant_id: tenant.id, student_id: studentId, amount, reason: 'added by admin' })
    setMessage(`${amount} token(s) added.`)
    if (selectedStudent?.id === studentId) setStudentTokens(prev => prev + amount)
  }


  async function removeTokens(studentId, amount) {
    const { data: tenant } = await supabase.from('tenants').select('id').eq('slug', 'skf-academy').single()
    await supabase.from('tokens').insert({ tenant_id: tenant.id, student_id: studentId, amount: -amount, reason: 'removed by admin - bounced payment' })
    setMessage(`${amount} token(s) removed.`)
    if (selectedStudent?.id === studentId) setStudentTokens(prev => prev - amount)
  }

  async function sendEmail() {
    if (!emailSubject || !emailBody) { setMessage('Please enter a subject and message.'); return }
    if (selectedStudentIds.length === 0) { setMessage('Please select at least one student.'); return }
    setEmailSending(true)
    const recipients = students.filter(s => selectedStudentIds.includes(s.id))
    for (const student of recipients) {
      await fetch('/api/send-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'admin_message', studentEmail: student.email, studentName: sName(student), subject: emailSubject, body: emailBody }) })
    }
    setMessage(`✅ Email sent to ${recipients.length} student${recipients.length > 1 ? 's' : ''}.`)
    setEmailSubject(''); setEmailBody(''); setSelectedStudentIds([]); setShowEmailCompose(false); setEmailSending(false)
  }

  function toggleStudentSelect(id) { setSelectedStudentIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]) }

  async function blockDates() {
    if (!blockStart || !blockEnd) { setMessage('Please select a start and end date.'); return }
    const { data: tenant } = await supabase.from('tenants').select('id').eq('slug', 'skf-academy').single()
    await supabase.from('blocked_ranges').insert({ tenant_id: tenant.id, start_date: blockStart, end_date: blockEnd, reason: blockReason || 'Unavailable' })
    await supabase.from('slots').update({ is_blocked: true, block_reason: blockReason || 'Unavailable' }).gte('slot_date', blockStart).lte('slot_date', blockEnd)
    setMessage(`Dates blocked from ${blockStart} to ${blockEnd}.`)
    setBlockStart(''); setBlockEnd(''); setBlockReason('')
    loadData()
  }

  async function unblockRange(range) {
    await supabase.from('blocked_ranges').delete().eq('id', range.id)
    await supabase.from('slots').update({ is_blocked: false, block_reason: null }).gte('slot_date', range.start_date).lte('slot_date', range.end_date)
    setMessage('Dates unblocked.')
    loadData()
  }

  async function blockSingleSlot() {
    if (!blockSlotDate) { setMessage('Please select a date.'); return }
    await supabase.from('slots').update({ is_blocked: true, block_reason: blockSlotReason || 'Unavailable' }).eq('slot_date', blockSlotDate).eq('start_hour', blockSlotHour)
    setMessage(`${blockSlotDate} at ${formatHour(blockSlotHour)} blocked.`)
    setBlockSlotDate(''); setBlockSlotReason('')
    loadData()
  }

  async function unblockSlot(slot) {
    await supabase.from('slots').update({ is_blocked: false, block_reason: null }).eq('id', slot.id)
    setMessage(`${slot.slot_date} at ${formatHour(slot.start_hour)} unblocked.`)
    loadData()
  }

  if (!isAuthorized) return null

  const today = new Date()
  const referenceDate = new Date(today)
  referenceDate.setDate(today.getDate() + weekOffset * 7)
  const weekDates = getWeekDates(referenceDate.toISOString().split('T')[0])
  const weekStart = weekDates[0]
  const weekEnd = weekDates[6]
  const weekBookings = bookings.filter(b => b.slots?.slot_date >= weekStart && b.slots?.slot_date <= weekEnd)

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
    padding: '0.5rem 1.1rem', background: activeTab === tab ? '#cc0000' : '#2a2a2a', color: '#fff',
    border: activeTab === tab ? '1px solid #cc0000' : '1px solid #444', borderRadius: '6px', cursor: 'pointer',
    fontSize: '0.85rem', fontWeight: activeTab === tab ? 'bold' : 'normal', letterSpacing: '0.5px'
  })

  const attendanceBadge = (att) => {
    if (att === 'attended') return { bg: '#1a3a1a', border: '#2a6a2a', color: '#66cc66', label: '✓ Attended' }
    if (att === 'dns') return { bg: '#3a1a1a', border: '#6a2a2a', color: '#cc6666', label: '✗ DNS' }
    return { bg: '#2a2a2a', border: '#444', color: '#666', label: 'Pending' }
  }

  return (
    <main style={{ fontFamily: 'sans-serif', maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #cc0000', paddingBottom: '0.5rem', marginBottom: '1rem' }}>
        <h1 style={{ color: '#fff', margin: 0 }}>SKF Academy — Admin</h1>
        <button onClick={handleLogout} style={{ padding: '0.4rem 0.9rem', background: 'transparent', color: '#666', border: '1px solid #444', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}>Sign Out</button>
      </div>

      {message && <p style={{ background: '#1a3a1a', border: '1px solid #2a6a2a', padding: '0.75rem', borderRadius: '6px', color: '#66cc66' }}>{message}</p>}

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
        <button style={tabStyle('week')} onClick={() => setActiveTab('week')}>📅 Week View</button>
        <button style={tabStyle('bookings')} onClick={() => setActiveTab('bookings')}>📋 All Bookings</button>
        <button style={tabStyle('students')} onClick={() => setActiveTab('students')}>👥 Students</button>
        <button style={tabStyle('block')} onClick={() => setActiveTab('block')}>🔒 Block Dates</button>
      </div>

      {/* ── WEEK VIEW ── */}
      {activeTab === 'week' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
            <button onClick={() => setWeekOffset(w => w - 1)} style={{ padding: '0.4rem 1rem', background: '#2a2a2a', color: '#fff', border: '1px solid #444', borderRadius: '6px', cursor: 'pointer' }}>← Prev</button>
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: '#fff', fontWeight: 'bold' }}>{formatWeekLabel()}</div>
              {weekOffset === 0 && <div style={{ color: '#cc0000', fontSize: '0.75rem' }}>THIS WEEK</div>}
            </div>
            <button onClick={() => setWeekOffset(w => w + 1)} style={{ padding: '0.4rem 1rem', background: '#2a2a2a', color: '#fff', border: '1px solid #444', borderRadius: '6px', cursor: 'pointer' }}>Next →</button>
          </div>
          <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1.25rem' }}>
            {weekDates.map(date => {
              const dayB = weekBookings.filter(b => b.slots?.slot_date === date)
              const isToday = date === today.toISOString().split('T')[0]
              return (
                <div key={date} style={{ flex: 1, textAlign: 'center', padding: '0.4rem 0.2rem', background: isToday ? '#3a0000' : '#2a2a2a', border: isToday ? '1px solid #cc0000' : '1px solid #333', borderRadius: '6px' }}>
                  <div style={{ color: '#999', fontSize: '0.7rem', textTransform: 'uppercase' }}>{DAY_NAMES[new Date(date + 'T00:00:00').getDay()]}</div>
                  <div style={{ color: '#fff', fontSize: '0.9rem', fontWeight: 'bold' }}>{new Date(date + 'T00:00:00').getDate()}</div>
                  {dayB.length > 0 && <div style={{ background: '#cc0000', borderRadius: '10px', color: '#fff', fontSize: '0.65rem', padding: '1px 5px', display: 'inline-block' }}>{dayB.length}</div>}
                </div>
              )
            })}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
              <thead>
                <tr>
                  <th style={{ width: '70px', color: '#666', fontSize: '0.75rem', textTransform: 'uppercase', padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid #333' }}>Time</th>
                  {weekDates.map(date => {
                    const isToday = date === today.toISOString().split('T')[0]
                    return (
                      <th key={date} style={{ color: isToday ? '#cc0000' : '#ccc', fontSize: '0.78rem', textTransform: 'uppercase', padding: '0.5rem 0.3rem', textAlign: 'center', borderBottom: '1px solid #333', background: isToday ? '#1a0000' : 'transparent' }}>
                        <div>{DAY_NAMES_FULL[new Date(date + 'T00:00:00').getDay()]}</div>
                        <div style={{ fontSize: '1rem', fontWeight: 'bold', color: isToday ? '#cc0000' : '#fff' }}>{new Date(date + 'T00:00:00').getDate()}</div>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {HOURS.map(hour => (
                  <tr key={hour}>
                    <td style={{ color: '#555', fontSize: '0.75rem', padding: '0.4rem 0.5rem', borderBottom: '1px solid #1f1f1f', whiteSpace: 'nowrap', verticalAlign: 'top' }}>{formatHour(hour)}</td>
                    {weekDates.map(date => {
                      const booking = getBookingForCell(date, hour)
                      const isToday = date === today.toISOString().split('T')[0]
                      const badge = booking ? attendanceBadge(booking.attendance) : null
                      return (
                        <td key={date} style={{ padding: '0.3rem', borderBottom: '1px solid #1f1f1f', background: isToday ? '#0d0000' : 'transparent', verticalAlign: 'top' }}>
                          {booking ? (
                            <div style={{ background: '#2a0000', border: '1px solid #cc0000', borderRadius: '5px', padding: '0.3rem 0.4rem' }}>
                              <div style={{ color: '#fff', fontSize: '0.78rem', fontWeight: 'bold' }}>{sName(booking.users)}</div>
                              <div style={{ color: '#cc0000', fontSize: '0.65rem', textTransform: 'uppercase' }}>Private Lesson</div>
                              {/* Attendance buttons */}
                              <div style={{ display: 'flex', gap: '2px', marginTop: '4px' }}>
                                <button onClick={() => markAttendance(booking.id, 'attended')} style={{ flex: 1, padding: '2px 3px', fontSize: '0.6rem', background: booking.attendance === 'attended' ? '#2a6a2a' : '#1a1a1a', color: booking.attendance === 'attended' ? '#66cc66' : '#555', border: '1px solid #333', borderRadius: '3px', cursor: 'pointer' }}>✓</button>
                                <button onClick={() => markAttendance(booking.id, 'dns')} style={{ flex: 1, padding: '2px 3px', fontSize: '0.6rem', background: booking.attendance === 'dns' ? '#6a2a2a' : '#1a1a1a', color: booking.attendance === 'dns' ? '#cc6666' : '#555', border: '1px solid #333', borderRadius: '3px', cursor: 'pointer' }}>DNS</button>
                                <button onClick={() => cancelBooking(booking)} style={{ flex: 1, padding: '2px 3px', fontSize: '0.6rem', background: 'transparent', color: '#884444', border: '1px solid #442222', borderRadius: '3px', cursor: 'pointer' }}>✗</button>
                              </div>
                            </div>
                          ) : <div style={{ height: '42px' }} />}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {weekBookings.length === 0 && <p style={{ color: '#555', textAlign: 'center', marginTop: '1.5rem' }}>No bookings this week.</p>}
        </div>
      )}

      {/* ── ALL BOOKINGS ── */}
      {activeTab === 'bookings' && (
        <div>
          <h2 style={{ color: '#fff', marginTop: 0 }}>Upcoming Bookings</h2>
          {bookings.length === 0 ? <p style={{ color: '#666' }}>No upcoming bookings.</p> : (
            bookings.map(b => {
              const badge = attendanceBadge(b.attendance)
              const within24 = isWithin24Hours(b.slots.slot_date, b.slots.start_hour)
              return (
                <div key={b.id} style={{ border: '1px solid #333', borderRadius: '8px', padding: '1rem', marginBottom: '0.75rem', background: '#2a2a2a' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <p style={{ margin: 0, fontWeight: 'bold', color: '#fff' }}>{b.slots.slot_date} at {formatHour(b.slots.start_hour)}</p>
                      <p style={{ margin: '0.2rem 0 0', color: '#888', fontSize: '0.85rem' }}>{sName(b.users)}</p>
                      {within24 && <p style={{ margin: '0.2rem 0 0', color: '#aa6600', fontSize: '0.75rem' }}>⚠️ Within 24hrs — no refund if cancelled</p>}
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      {/* Attendance */}
                      <div style={{ display: 'flex', gap: '0.3rem' }}>
                        <button onClick={() => markAttendance(b.id, 'attended')} style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', background: b.attendance === 'attended' ? '#1a3a1a' : '#1a1a1a', color: b.attendance === 'attended' ? '#66cc66' : '#555', border: `1px solid ${b.attendance === 'attended' ? '#2a6a2a' : '#333'}`, borderRadius: '4px', cursor: 'pointer' }}>✓ Attended</button>
                        <button onClick={() => markAttendance(b.id, 'dns')} style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', background: b.attendance === 'dns' ? '#3a1a1a' : '#1a1a1a', color: b.attendance === 'dns' ? '#cc6666' : '#555', border: `1px solid ${b.attendance === 'dns' ? '#6a2a2a' : '#333'}`, borderRadius: '4px', cursor: 'pointer' }}>✗ DNS</button>
                      </div>
                      <button onClick={() => cancelBooking(b)} style={{ padding: '0.3rem 0.75rem', background: 'transparent', color: '#cc0000', border: '1px solid #cc0000', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' }}>Cancel</button>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* ── STUDENTS ── */}
      {activeTab === 'students' && (
        <div style={{ display: 'flex', gap: '1.5rem' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {upcomingBirthdays.length > 0 && (
              <div style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ color: '#fff', marginTop: 0 }}>🎂 Upcoming Birthdays</h3>
                {upcomingBirthdays.map(s => (
                  <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', background: '#2a1a1a', border: '1px solid #cc0000', borderRadius: '8px', padding: '0.6rem 1rem', marginBottom: '0.4rem' }}>
                    <strong style={{ color: '#fff', fontSize: '0.9rem' }}>{sName(s)}</strong>
                    <span style={{ color: '#cc0000', fontSize: '0.85rem' }}>🎂 {s.upcomingBirthday.toLocaleDateString('en-CA', { month: 'long', day: 'numeric' })}</span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <h2 style={{ color: '#fff', margin: 0 }}>Students ({students.length})</h2>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                {selectedStudentIds.length > 0 ? (
                  <>
                    <span style={{ color: '#cc0000', fontSize: '0.85rem' }}>{selectedStudentIds.length} selected</span>
                    <button onClick={() => setSelectedStudentIds([])} style={{ padding: '0.3rem 0.7rem', background: 'transparent', color: '#666', border: '1px solid #444', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}>Clear</button>
                    <button onClick={() => setShowEmailCompose(true)} style={{ padding: '0.3rem 0.9rem', background: '#cc0000', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}>✉️ Email Selected</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => setSelectedStudentIds(students.map(s => s.id))} style={{ padding: '0.3rem 0.7rem', background: '#2a2a2a', color: '#ccc', border: '1px solid #444', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}>Select All</button>
                    <button onClick={() => { setSelectedStudentIds(students.map(s => s.id)); setShowEmailCompose(true) }} style={{ padding: '0.3rem 0.9rem', background: '#2a2a2a', color: '#ccc', border: '1px solid #444', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}>✉️ Email All</button>
                  </>
                )}
              </div>
            </div>

            {showEmailCompose && (
              <div style={{ background: '#1a1a1a', border: '1px solid #cc0000', borderRadius: '10px', padding: '1.25rem', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                  <h3 style={{ color: '#fff', margin: 0, fontSize: '0.95rem', textTransform: 'uppercase' }}>✉️ Compose — {selectedStudentIds.length} recipient{selectedStudentIds.length !== 1 ? 's' : ''}</h3>
                  <button onClick={() => setShowEmailCompose(false)} style={{ background: 'transparent', color: '#666', border: 'none', cursor: 'pointer' }}>✕</button>
                </div>
                <input type="text" placeholder="Subject" value={emailSubject} onChange={e => setEmailSubject(e.target.value)} style={{ width: '100%', padding: '0.6rem', background: '#2a2a2a', border: '1px solid #444', borderRadius: '4px', color: '#fff', marginBottom: '0.75rem', boxSizing: 'border-box' }} />
                <textarea placeholder="Message..." value={emailBody} onChange={e => setEmailBody(e.target.value)} rows={5} style={{ width: '100%', padding: '0.6rem', background: '#2a2a2a', border: '1px solid #444', borderRadius: '4px', color: '#fff', marginBottom: '0.75rem', boxSizing: 'border-box', resize: 'vertical' }} />
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button onClick={sendEmail} disabled={emailSending} style={{ padding: '0.6rem 1.5rem', background: '#cc0000', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>{emailSending ? 'Sending...' : `Send to ${selectedStudentIds.length}`}</button>
                  <button onClick={() => setShowEmailCompose(false)} style={{ padding: '0.6rem 1rem', background: 'transparent', color: '#666', border: '1px solid #444', borderRadius: '6px', cursor: 'pointer' }}>Cancel</button>
                </div>
              </div>
            )}

            {students.map(s => {
              const isSelected = selectedStudentIds.includes(s.id)
              const isActive = selectedStudent?.id === s.id
              const beltColor = BELT_COLORS[s.belt_rank] || '#444'
              return (
                <div key={s.id} style={{ border: `1px solid ${isActive ? '#cc0000' : isSelected ? '#884444' : '#333'}`, borderRadius: '8px', padding: '0.85rem 1rem', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.75rem', background: isActive ? '#2a0000' : isSelected ? '#1e1010' : '#2a2a2a', cursor: 'pointer' }}>
                  <input type="checkbox" checked={isSelected} onChange={() => toggleStudentSelect(s.id)} onClick={e => e.stopPropagation()} style={{ width: '16px', height: '16px', accentColor: '#cc0000', cursor: 'pointer', flexShrink: 0 }} />
                  {/* Belt indicator */}
                  <div style={{ width: '8px', height: '32px', borderRadius: '2px', background: beltColor, flexShrink: 0, border: '1px solid rgba(255,255,255,0.1)' }} />
                  <div style={{ flex: 1, minWidth: 0 }} onClick={() => openStudentProfile(s)}>
                    <div style={{ color: '#fff', fontWeight: 'bold', fontSize: '0.95rem' }}>{sName(s)}</div>
                    <div style={{ color: '#666', fontSize: '0.8rem', marginTop: '2px' }}>
                      {s.belt_rank && <span style={{ color: beltColor === '#eee' ? '#999' : beltColor, marginRight: '0.75rem', textTransform: 'capitalize' }}>{s.belt_rank} belt</span>}
                      {s.email}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                    <button onClick={e => { e.stopPropagation(); addTokens(s.id, 1) }} style={{ padding: '0.3rem 0.7rem', background: '#cc0000', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}>+1</button>
                    <button onClick={e => { e.stopPropagation(); addTokens(s.id, 4) }} style={{ padding: '0.3rem 0.7rem', background: '#cc0000', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}>+4</button>
                    <button onClick={e => { e.stopPropagation(); removeTokens(s.id, 1) }} style={{ padding: '0.3rem 0.7rem', background: 'transparent', color: '#cc6666', border: '1px solid #663333', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}>-1</button>
                    <button onClick={e => { e.stopPropagation(); removeTokens(s.id, 4) }} style={{ padding: '0.3rem 0.7rem', background: 'transparent', color: '#cc6666', border: '1px solid #663333', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}>-4</button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Profile Panel */}
          {selectedStudent && (
            <div style={{ width: '300px', flexShrink: 0, background: '#1a1a1a', border: '1px solid #cc0000', borderRadius: '10px', padding: '1.25rem', alignSelf: 'flex-start', position: 'sticky', top: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
                <div>
                  <div style={{ color: '#cc0000', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Student Profile</div>
                  <div style={{ color: '#fff', fontWeight: 'bold', fontSize: '1.1rem', marginTop: '0.25rem' }}>{sName(selectedStudent)}</div>
                </div>
                <button onClick={() => setSelectedStudent(null)} style={{ background: 'transparent', color: '#555', border: 'none', cursor: 'pointer', fontSize: '1.1rem' }}>✕</button>
              </div>

              {profileLoading ? <p style={{ color: '#555' }}>Loading...</p> : (
                <>
                  {/* Belt Rank */}
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{ color: '#666', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.4rem' }}>Belt Rank</div>
                    {editingRank ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                        {BELT_RANKS.map(rank => (
                          <button key={rank} onClick={() => updateBeltRank(selectedStudent.id, rank)} style={{ padding: '0.3rem 0.6rem', background: selectedStudent.belt_rank === rank ? '#cc0000' : '#2a2a2a', color: '#fff', border: `1px solid ${BELT_COLORS[rank]}`, borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', textTransform: 'capitalize' }}>{rank}</button>
                        ))}
                        <button onClick={() => setEditingRank(false)} style={{ padding: '0.3rem 0.6rem', background: 'transparent', color: '#666', border: '1px solid #444', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}>Cancel</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ width: '12px', height: '28px', borderRadius: '2px', background: BELT_COLORS[selectedStudent.belt_rank] || '#444', border: '1px solid rgba(255,255,255,0.2)' }} />
                        <span style={{ color: '#fff', textTransform: 'capitalize', fontSize: '0.95rem' }}>{selectedStudent.belt_rank || 'Not set'}</span>
                        <button onClick={() => setEditingRank(true)} style={{ padding: '0.2rem 0.6rem', background: '#2a2a2a', color: '#ccc', border: '1px solid #444', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem', marginLeft: 'auto' }}>Change</button>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div style={{ marginBottom: '1rem' }}>
                    {[
                      { label: 'Email', value: selectedStudent.email },
                      { label: 'Phone', value: selectedStudent.phone || '—' },
                      { label: 'Date of Birth', value: selectedStudent.date_of_birth || '—' },
                      { label: 'Tokens', value: studentTokens, highlight: true },
                    ].map(({ label, value, highlight }) => (
                      <div key={label} style={{ marginBottom: '0.6rem' }}>
                        <div style={{ color: '#666', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '1px' }}>{label}</div>
                        <div style={{ color: highlight ? '#cc0000' : '#fff', fontSize: highlight ? '1.3rem' : '0.9rem', fontWeight: highlight ? 'bold' : 'normal' }}>{value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Token buttons */}
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <button onClick={() => addTokens(selectedStudent.id, 1)} style={{ flex: 1, padding: '0.5rem', background: '#cc0000', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold' }}>+1</button>
                    <button onClick={() => addTokens(selectedStudent.id, 4)} style={{ flex: 1, padding: '0.5rem', background: '#cc0000', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold' }}>+4</button>
                    <button onClick={() => removeTokens(selectedStudent.id, 1)} style={{ flex: 1, padding: '0.5rem', background: 'transparent', color: '#cc6666', border: '1px solid #663333', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold' }}>-1</button>
                    <button onClick={() => removeTokens(selectedStudent.id, 4)} style={{ flex: 1, padding: '0.5rem', background: 'transparent', color: '#cc6666', border: '1px solid #663333', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold' }}>-4</button>
                  </div>

                  {/* Email */}
                  <button onClick={() => { setSelectedStudentIds([selectedStudent.id]); setShowEmailCompose(true) }} style={{ width: '100%', padding: '0.5rem', background: '#2a2a2a', color: '#ccc', border: '1px solid #444', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem', marginBottom: '1.25rem' }}>✉️ Send Email</button>

                  {/* Attendance / Booking History */}
                  <div>
                    <div style={{ color: '#666', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.5rem' }}>Attendance Record</div>
                    {studentBookings.length === 0 ? <p style={{ color: '#555', fontSize: '0.85rem', margin: 0 }}>No bookings yet.</p> : (
                      studentBookings.map(b => {
                        const badge = attendanceBadge(b.attendance)
                        return (
                          <div key={b.id} style={{ padding: '0.5rem 0', borderBottom: '1px solid #222' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                              <div>
                                <span style={{ color: '#fff', fontSize: '0.85rem' }}>{b.slots.slot_date}</span>
                                <span style={{ color: '#555', fontSize: '0.8rem', marginLeft: '0.4rem' }}>{formatHour(b.slots.start_hour)}</span>
                              </div>
                              <span style={{ fontSize: '0.7rem', color: b.status === 'confirmed' ? '#888' : '#555', textTransform: 'uppercase' }}>{b.status}</span>
                            </div>
                            {b.status === 'confirmed' && (
                              <div style={{ display: 'flex', gap: '0.3rem' }}>
                                <button onClick={() => markAttendance(b.id, 'attended')} style={{ flex: 1, padding: '2px 4px', fontSize: '0.7rem', background: b.attendance === 'attended' ? '#1a3a1a' : '#1a1a1a', color: b.attendance === 'attended' ? '#66cc66' : '#555', border: `1px solid ${b.attendance === 'attended' ? '#2a6a2a' : '#333'}`, borderRadius: '3px', cursor: 'pointer' }}>✓ Attended</button>
                                <button onClick={() => markAttendance(b.id, 'dns')} style={{ flex: 1, padding: '2px 4px', fontSize: '0.7rem', background: b.attendance === 'dns' ? '#3a1a1a' : '#1a1a1a', color: b.attendance === 'dns' ? '#cc6666' : '#555', border: `1px solid ${b.attendance === 'dns' ? '#6a2a2a' : '#333'}`, borderRadius: '3px', cursor: 'pointer' }}>✗ DNS</button>
                              </div>
                            )}
                            {b.status !== 'confirmed' && b.attendance && (
                              <span style={{ fontSize: '0.7rem', color: badge.color, background: badge.bg, padding: '1px 6px', borderRadius: '3px', border: `1px solid ${badge.border}` }}>{badge.label}</span>
                            )}
                          </div>
                        )
                      })
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── BLOCK DATES ── */}
      {activeTab === 'block' && (
        <div>
          <h2 style={{ color: '#fff', marginTop: 0 }}>Block Date Range</h2>
          <div style={{ border: '1px solid #333', borderRadius: '8px', padding: '1.5rem', marginBottom: '1rem', background: '#2a2a2a' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div><label style={{ display: 'block', marginBottom: '0.25rem', color: '#999', fontSize: '0.8rem', textTransform: 'uppercase' }}>From</label><input type="date" value={blockStart} onChange={e => setBlockStart(e.target.value)} style={{ width: '100%', padding: '0.5rem', background: '#1a1a1a', border: '1px solid #444', borderRadius: '4px', color: '#fff' }} /></div>
              <div><label style={{ display: 'block', marginBottom: '0.25rem', color: '#999', fontSize: '0.8rem', textTransform: 'uppercase' }}>To</label><input type="date" value={blockEnd} onChange={e => setBlockEnd(e.target.value)} style={{ width: '100%', padding: '0.5rem', background: '#1a1a1a', border: '1px solid #444', borderRadius: '4px', color: '#fff' }} /></div>
            </div>
            <input type="text" placeholder="Reason" value={blockReason} onChange={e => setBlockReason(e.target.value)} style={{ width: '100%', padding: '0.5rem', background: '#1a1a1a', border: '1px solid #444', borderRadius: '4px', color: '#fff', marginBottom: '1rem', boxSizing: 'border-box' }} />
            <button onClick={blockDates} style={{ padding: '0.75rem 1.5rem', background: '#cc0000', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Block These Dates</button>
          </div>
          {blockedRanges.length > 0 && (<><h3 style={{ color: '#fff' }}>Currently Blocked Ranges</h3>{blockedRanges.map(r => (<div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #cc0000', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '0.5rem', background: '#2a1a1a' }}><div><strong style={{ color: '#fff' }}>{r.start_date} → {r.end_date}</strong><span style={{ marginLeft: '0.75rem', color: '#666', fontSize: '0.9rem' }}>{r.reason}</span></div><button onClick={() => unblockRange(r)} style={{ padding: '0.3rem 0.75rem', background: 'transparent', color: '#cc0000', border: '1px solid #cc0000', borderRadius: '4px', cursor: 'pointer' }}>Unblock</button></div>))}</>)}
          <h2 style={{ color: '#fff', marginTop: '2rem' }}>Block Single Time Slot</h2>
          <div style={{ border: '1px solid #333', borderRadius: '8px', padding: '1.5rem', marginBottom: '1rem', background: '#2a2a2a' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div><label style={{ display: 'block', marginBottom: '0.25rem', color: '#999', fontSize: '0.8rem', textTransform: 'uppercase' }}>Date</label><input type="date" value={blockSlotDate} onChange={e => setBlockSlotDate(e.target.value)} style={{ width: '100%', padding: '0.5rem', background: '#1a1a1a', border: '1px solid #444', borderRadius: '4px', color: '#fff' }} /></div>
              <div><label style={{ display: 'block', marginBottom: '0.25rem', color: '#999', fontSize: '0.8rem', textTransform: 'uppercase' }}>Time</label><select value={blockSlotHour} onChange={e => setBlockSlotHour(Number(e.target.value))} style={{ width: '100%', padding: '0.5rem', background: '#1a1a1a', border: '1px solid #444', borderRadius: '4px', color: '#fff' }}>{HOURS.map(h => <option key={h} value={h}>{formatHour(h)}</option>)}</select></div>
            </div>
            <input type="text" placeholder="Reason (optional)" value={blockSlotReason} onChange={e => setBlockSlotReason(e.target.value)} style={{ width: '100%', padding: '0.5rem', background: '#1a1a1a', border: '1px solid #444', borderRadius: '4px', color: '#fff', marginBottom: '1rem', boxSizing: 'border-box' }} />
            <button onClick={blockSingleSlot} style={{ padding: '0.75rem 1.5rem', background: '#cc0000', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Block This Slot</button>
          </div>
          {blockedSlots.length > 0 && (<><h3 style={{ color: '#fff' }}>Currently Blocked Slots</h3>{blockedSlots.map(s => (<div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #cc0000', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '0.5rem', background: '#2a1a1a' }}><div><strong style={{ color: '#fff' }}>{s.slot_date} at {formatHour(s.start_hour)}</strong>{s.block_reason && <span style={{ marginLeft: '0.75rem', color: '#666', fontSize: '0.9rem' }}>{s.block_reason}</span>}</div><button onClick={() => unblockSlot(s)} style={{ padding: '0.3rem 0.75rem', background: 'transparent', color: '#cc0000', border: '1px solid #cc0000', borderRadius: '4px', cursor: 'pointer' }}>Unblock</button></div>))}</>)}
        </div>
      )}
    </main>
  )
}
