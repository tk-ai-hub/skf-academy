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

function getWeekDates(weekOffset) {
  const now = new Date()
  const local = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dow = local.getDay()
  const monday = new Date(local)
  monday.setDate(local.getDate() - (dow === 0 ? 6 : dow - 1) + (weekOffset || 0) * 7)
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)
    return date.getFullYear() + '-' + String(date.getMonth()+1).padStart(2,'0') + '-' + String(date.getDate()).padStart(2,'0')
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

function studentNameById(students, id) {
  const s = students.find(s => s.id === id)
  return studentName(s)
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
  const [blockSlotEndHour, setBlockSlotEndHour] = useState(10)
  const [blockSlotReason, setBlockSlotReason] = useState('')

  // Weekly calendar state
  const [activeTab, setActiveTab] = useState('week') // 'week' | 'bookings' | 'students' | 'block'
  const [weekOffset, setWeekOffset] = useState(0)

  // Quick-book modal state
  const [bookModal, setBookModal] = useState(null) // { date, hour }
  const [bookModalSlot, setBookModalSlot] = useState(undefined)
  const [bookModalSearch, setBookModalSearch] = useState('')
  const [bookModalStudent, setBookModalStudent] = useState(null)
  const [bookModalIsGuest, setBookModalIsGuest] = useState(false)
  const [bookModalGuestFirst, setBookModalGuestFirst] = useState('')
  const [bookModalGuestLast, setBookModalGuestLast] = useState('')
  const [bookModalGuestPhone, setBookModalGuestPhone] = useState('')
  const [bookModalProcessing, setBookModalProcessing] = useState(false)
  const [bookModalSuccess, setBookModalSuccess] = useState(false)
  const [bookModalError, setBookModalError] = useState('')
  const [blockWeekOffset, setBlockWeekOffset] = useState(0)
  const [blockCalSlots, setBlockCalSlots] = useState([])

  // Add student modal
  const [addStudentModal, setAddStudentModal] = useState(false)
  const [addStudentForm, setAddStudentForm] = useState({})
  const [addStudentSaving, setAddStudentSaving] = useState(false)
  const [addStudentError, setAddStudentError] = useState('')

  // Inline token state
  const [tokenBalances, setTokenBalances] = useState({})
  const [inlineToken, setInlineToken] = useState(null) // { studentId, amount: '' }
  const [inlineTokenSaving, setInlineTokenSaving] = useState(false)

  // Student profile modal
  const [profileModal, setProfileModal] = useState(null)
  const [profileTokens, setProfileTokens] = useState(0)
  const [profileBookings, setProfileBookings] = useState([])
  const [profileEdit, setProfileEdit] = useState({})
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileTokenAdjust, setProfileTokenAdjust] = useState('')
  const [profileTokenNote, setProfileTokenNote] = useState('')
  const [profilePastBookings, setProfilePastBookings] = useState([])
  const [profileBookingTab, setProfileBookingTab] = useState('upcoming')
  const [profileDeleteConfirm, setProfileDeleteConfirm] = useState(false)
  const [profileDeleting, setProfileDeleting] = useState(false)

  useEffect(() => { loadData(); loadTokenBalances() }, [])
  useEffect(() => { loadBlockCalSlots() }, [blockWeekOffset])

  async function loadData() {
    const { data: bookingData } = await supabase
      .from('bookings')
      .select(`
        id, status, booked_at, tenant_id, student_id,
        slots!bookings_slot_id_fkey (id, slot_date, start_hour)
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

  async function loadTokenBalances() {
    const { data } = await supabase.from('tokens').select('student_id, amount')
    if (!data) return
    const balances = {}
    data.forEach(t => { balances[t.student_id] = (balances[t.student_id] || 0) + t.amount })
    setTokenBalances(balances)
  }

  async function loadBlockCalSlots() {
    const dates = getWeekDates(blockWeekOffset)
    const { data } = await supabase
      .from('slots')
      .select('id, slot_date, start_hour, is_blocked, block_reason')
      .gte('slot_date', dates[0])
      .lte('slot_date', dates[6])
      .order('slot_date', { ascending: true })
      .order('start_hour', { ascending: true })
    setBlockCalSlots(data || [])
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

  async function submitAddStudent() {
    if (addStudentSaving) return
    setAddStudentError('')
    setAddStudentSaving(true)
    const res = await fetch('/api/admin/create-student', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(addStudentForm),
    })
    const d = await res.json()
    setAddStudentSaving(false)
    if (!res.ok) { setAddStudentError(d.error || 'Failed to create student'); return }
    setAddStudentModal(false)
    setAddStudentForm({})
    loadData()
    loadTokenBalances()
    setMessage(`Student "${d.fullName}" added successfully.`)
  }

  async function submitInlineToken() {
    if (!inlineToken || inlineTokenSaving) return
    const amt = parseInt(inlineToken.amount)
    if (isNaN(amt) || amt === 0) return
    setInlineTokenSaving(true)
    const { data: tenant } = await supabase.from('tenants').select('id').eq('slug', 'skf-academy').single()
    await supabase.from('tokens').insert({
      tenant_id: tenant.id,
      student_id: inlineToken.studentId,
      amount: amt,
      reason: amt > 0 ? 'added by admin' : 'removed by admin'
    })
    setTokenBalances(prev => ({ ...prev, [inlineToken.studentId]: (prev[inlineToken.studentId] || 0) + amt }))
    setInlineTokenSaving(false)
    setInlineToken(null)
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
    loadData(); loadBlockCalSlots()
  }

  async function unblockRange(range) {
    await supabase.from('blocked_ranges').delete().eq('id', range.id)
    await supabase.from('slots')
      .update({ is_blocked: false, block_reason: null })
      .gte('slot_date', range.start_date).lte('slot_date', range.end_date)
    setMessage('Dates unblocked.')
    loadData(); loadBlockCalSlots()
  }

  async function blockSingleSlot() {
    if (!blockSlotDate) { setMessage('Please select a date.'); return }
    const endHour = Math.max(blockSlotHour, blockSlotEndHour)
    const startHour = Math.min(blockSlotHour, blockSlotEndHour)
    await supabase.from('slots')
      .update({ is_blocked: true, block_reason: blockSlotReason || 'Unavailable' })
      .eq('slot_date', blockSlotDate)
      .gte('start_hour', startHour)
      .lte('start_hour', endHour)
    const label = startHour === endHour
      ? `${blockSlotDate} at ${formatHour(startHour)}`
      : `${blockSlotDate} from ${formatHour(startHour)} to ${formatHour(endHour)}`
    setMessage(`${label} blocked.`)
    setBlockSlotDate(''); setBlockSlotReason('')
    loadData(); loadBlockCalSlots()
  }

  async function unblockSlot(slot) {
    await supabase.from('slots')
      .update({ is_blocked: false, block_reason: null })
      .eq('id', slot.id)
    setMessage(`${slot.slot_date} at ${formatHour(slot.start_hour)} unblocked.`)
    loadData(); loadBlockCalSlots()
  }

  // --- Quick-book modal ---
  async function openBookModal(date, hour) {
    setBookModal({ date, hour })
    setBookModalSlot(undefined) // undefined = loading, null = not found
    setBookModalSearch('')
    setBookModalStudent(null)
    setBookModalIsGuest(false)
    setBookModalGuestFirst('')
    setBookModalGuestLast('')
    setBookModalGuestPhone('')
    setBookModalProcessing(false)
    setBookModalSuccess(false)
    setBookModalError('')
    const { data } = await supabase.from('slots').select('*').eq('slot_date', date).eq('start_hour', hour).maybeSingle()
    setBookModalSlot(data || null)
  }

  function closeBookModal() {
    setBookModal(null)
    setBookModalSlot(undefined)
    setBookModalSearch('')
    setBookModalStudent(null)
    setBookModalIsGuest(false)
    setBookModalGuestFirst('')
    setBookModalGuestLast('')
    setBookModalGuestPhone('')
    setBookModalSuccess(false)
    setBookModalError('')
  }

  async function confirmBookModal() {
    if (!bookModalSlot || bookModalProcessing) return
    if (!bookModalIsGuest && !bookModalStudent) return
    if (bookModalIsGuest && !bookModalGuestFirst.trim()) return
    setBookModalProcessing(true)
    setBookModalError('')
    const payload = bookModalIsGuest
      ? { slotId: bookModalSlot.id, guestFirstName: bookModalGuestFirst.trim(), guestLastName: bookModalGuestLast.trim(), guestPhone: bookModalGuestPhone.trim() }
      : { slotId: bookModalSlot.id, studentId: bookModalStudent.id }
    try {
      const res = await fetch('/api/admin-book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const d = await res.json()
      setBookModalProcessing(false)
      if (res.ok) {
        setBookModalSuccess(true)
        loadData()
        setTimeout(() => closeBookModal(), 2000)
      } else {
        setBookModalError(d.error || 'Booking failed. Please try again.')
      }
    } catch (err) {
      setBookModalProcessing(false)
      setBookModalError('Network error: ' + err.message)
    }
  }

  const bookModalFiltered = bookModalSearch.trim()
    ? students.filter(s => {
        const name = studentName(s).toLowerCase()
        const phone = (s.phone || '').replace(/\D/g, '')
        const q = bookModalSearch.toLowerCase().trim()
        return name.includes(q) || phone.includes(q.replace(/\D/g, ''))
      })
    : students

  // --- Student Profile Modal ---
  async function openProfileModal(s) {
    setProfileModal(s)
    setProfileEdit({ firstName: s.first_name || '', lastName: s.last_name || '', phone: s.phone || '', dob: s.date_of_birth || '', beltRank: s.belt_rank || '' })
    setProfileTokenAdjust('')
    setProfileTokenNote('')
    setProfileSaving(false)
    setProfileBookings([])
    setProfilePastBookings([])
    setProfileBookingTab('upcoming')
    const { data: tokenData } = await supabase.from('tokens').select('amount').eq('student_id', s.id)
    setProfileTokens((tokenData || []).reduce((sum, t) => sum + t.amount, 0))
    const today = new Date().toISOString().split('T')[0]
    const { data: bData } = await supabase
      .from('bookings')
      .select('id, status, tenant_id, slots!bookings_slot_id_fkey(slot_date, start_hour)')
      .eq('student_id', s.id)
      .in('status', ['confirmed', 'cancelled'])
      .order('booked_at', { ascending: false })
    const all = (bData || []).filter(b => b.slots)
    setProfileBookings(all.filter(b => b.status === 'confirmed' && b.slots.slot_date >= today))
    setProfilePastBookings(all.filter(b => b.slots.slot_date < today || b.status === 'cancelled'))
  }

  function closeProfileModal() {
    setProfileModal(null)
    setProfilePastBookings([])
    setProfileDeleteConfirm(false)
    setProfileDeleting(false)
  }

  async function deleteStudent() {
    if (!profileModal || profileDeleting) return
    setProfileDeleting(true)
    const res = await fetch('/api/admin/delete-student', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: profileModal.id })
    })
    if (res.ok) {
      setStudents(prev => prev.filter(s => s.id !== profileModal.id))
      setTokenBalances(prev => { const n = { ...prev }; delete n[profileModal.id]; return n })
      closeProfileModal()
      loadData()
    } else {
      const d = await res.json()
      setProfileDeleting(false)
      setProfileDeleteConfirm(false)
      setMessage('Delete failed: ' + (d.error || 'Unknown error'))
    }
  }

  async function saveProfileEdit() {
    if (!profileModal) return
    setProfileSaving(true)
    const res = await fetch('/api/admin/update-student', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: profileModal.id, firstName: profileEdit.firstName, lastName: profileEdit.lastName, phone: profileEdit.phone, dob: profileEdit.dob, beltRank: profileEdit.beltRank })
    })
    setProfileSaving(false)
    if (res.ok) {
      setStudents(prev => prev.map(s => s.id === profileModal.id
        ? { ...s, first_name: profileEdit.firstName, last_name: profileEdit.lastName, phone: profileEdit.phone, date_of_birth: profileEdit.dob || null, belt_rank: profileEdit.beltRank, full_name: [profileEdit.firstName, profileEdit.lastName].filter(Boolean).join(' ') }
        : s
      ))
      setProfileModal(prev => ({ ...prev, first_name: profileEdit.firstName, last_name: profileEdit.lastName, phone: profileEdit.phone, date_of_birth: profileEdit.dob || null, belt_rank: profileEdit.beltRank }))
      setMessage('Profile updated.')
    }
  }

  async function applyTokenAdjust(sign) {
    const amt = parseInt(profileTokenAdjust)
    if (!amt || amt <= 0 || !profileModal) return
    const final = sign * amt
    const { data: tenant } = await supabase.from('tenants').select('id').eq('slug', 'skf-academy').single()
    await supabase.from('tokens').insert({ tenant_id: tenant.id, student_id: profileModal.id, amount: final, reason: profileTokenNote || (sign > 0 ? 'added by admin' : 'removed by admin') })
    setProfileTokens(prev => prev + final)
    setProfileTokenAdjust('')
    setProfileTokenNote('')
    setMessage(`${sign > 0 ? 'Added' : 'Removed'} ${amt} token(s).`)
  }

  // --- Block Calendar Logic ---
  const blockWeekDates = getWeekDates(blockWeekOffset)
  const blockWeekStart = blockWeekDates[0]
  const blockWeekEnd = blockWeekDates[6]

  function formatBlockWeekLabel() {
    const s = new Date(blockWeekStart + 'T00:00:00')
    const e = new Date(blockWeekEnd + 'T00:00:00')
    const opts = { month: 'short', day: 'numeric' }
    return `${s.toLocaleDateString('en-CA', opts)} – ${e.toLocaleDateString('en-CA', opts)}, ${e.getFullYear()}`
  }

  function getBlockCellSlot(date, hour) {
    return blockCalSlots.find(s => s.slot_date === date && s.start_hour === hour)
  }

  async function toggleBlockCell(slot) {
    if (!slot) return
    if (slot.is_blocked) {
      await unblockSlot(slot)
    } else {
      await supabase.from('slots')
        .update({ is_blocked: true, block_reason: blockSlotReason || 'Unavailable' })
        .eq('id', slot.id)
      loadData(); loadBlockCalSlots()
    }
  }

  // --- Weekly Calendar Logic ---
  const today = new Date()
  const referenceDate = new Date(today)
  referenceDate.setDate(today.getDate() + weekOffset * 7)
  const weekDates = getWeekDates(weekOffset)
  const weekStart = weekDates[0]
  const weekEnd = weekDates[6]

  const weekBookings = bookings.filter(b =>
    b.slots?.slot_date >= weekStart && b.slots?.slot_date <= weekEnd
  )

  function getBookingsForCell(date, hour) {
    return weekBookings.filter(b => b.slots?.slot_date === date && b.slots?.start_hour === hour)
  }

  function getBlockedInfo(date, hour) {
    // Check full-day range blocks
    const range = blockedRanges.find(r => date >= r.start_date && date <= r.end_date)
    if (range) return range.reason || 'Unavailable'
    // Check individual hour blocks
    const slot = blockedSlots.find(s => s.slot_date === date && s.start_hour === hour)
    if (slot) return slot.block_reason || 'Unavailable'
    return null
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
    <main style={{ fontFamily: 'sans-serif' }}>
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
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            onClick={() => { setAddStudentModal(true); setAddStudentForm({}); setAddStudentError('') }}
            style={{ padding: '0.5rem 1.1rem', background: 'transparent', color: '#fff', border: '2px solid #fff', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold', letterSpacing: '0.5px' }}
          >+ Add Student</button>
          <a href="/admin/book" style={{
            padding: '0.5rem 1.1rem',
            background: '#cc0000',
            color: '#fff',
            border: '1px solid #cc0000',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '0.85rem',
            fontWeight: 'bold',
            letterSpacing: '0.5px',
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem'
          }}>+ Book Lesson</a>
        </div>
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
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
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
                      const cellBookings = getBookingsForCell(date, hour)
                      const blockedReason = getBlockedInfo(date, hour)
                      const isToday = date === today.toISOString().split('T')[0]
                      return (
                        <td key={date} style={{
                          padding: '0.3rem',
                          borderBottom: '1px solid #1f1f1f',
                          background: blockedReason ? '#111' : isToday ? '#0d0000' : 'transparent',
                          verticalAlign: 'top',
                          minHeight: '48px'
                        }}>
                          {blockedReason ? (
                            <div style={{
                              background: 'repeating-linear-gradient(45deg, #1a1a1a, #1a1a1a 4px, #141414 4px, #141414 8px)',
                              border: '1px solid #2a2a2a',
                              borderRadius: '5px',
                              padding: '0.3rem 0.4rem',
                              minHeight: '42px',
                              display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
                              gap: '2px'
                            }}>
                              <span style={{ fontSize: '0.7rem' }}>🔒</span>
                              <span style={{ color: '#555', fontSize: '0.62rem', textAlign: 'center', lineHeight: 1.2 }}>
                                {blockedReason}
                              </span>
                            </div>
                          ) : cellBookings.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                              {cellBookings.map(booking => (
                                <div key={booking.id} style={{
                                  background: '#2a0000',
                                  border: '1px solid #cc0000',
                                  borderRadius: '5px',
                                  padding: '0.3rem 0.4rem',
                                  cursor: 'default'
                                }}>
                                  <div style={{ color: '#fff', fontSize: '0.78rem', fontWeight: 'bold', lineHeight: 1.3 }}>
                                    {studentNameById(students, booking.student_id)}
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
                              ))}
                            </div>
                          ) : (
                            <button
                              onClick={() => openBookModal(date, hour)}
                              style={{
                                width: '100%', height: '42px', background: 'transparent', border: 'none',
                                color: '#333', fontSize: '1.2rem', cursor: 'pointer', borderRadius: '4px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                              }}
                              onMouseEnter={e => { e.currentTarget.style.color = '#cc0000'; e.currentTarget.style.background = '#1a0000' }}
                              onMouseLeave={e => { e.currentTarget.style.color = '#333'; e.currentTarget.style.background = 'transparent' }}
                            >+</button>
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
                  <p style={{ margin: '0.15rem 0 0', color: '#888', fontSize: '0.85rem' }}>{studentNameById(students, b.student_id)}</p>
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

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <h2 style={{ color: '#fff', margin: 0 }}>Students ({students.length})</h2>
            <button
              onClick={() => { setAddStudentModal(true); setAddStudentForm({}); setAddStudentError('') }}
              style={{ padding: '0.5rem 1.25rem', background: '#cc0000', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem' }}
            >+ Add Student</button>
          </div>
          {students.length === 0 ? (
            <p style={{ color: '#666' }}>No students yet.</p>
          ) : (
            students.map(s => {
              const balance = tokenBalances[s.id] || 0
              const isEditing = inlineToken?.studentId === s.id
              return (
                <div
                  key={s.id}
                  style={{ border: '1px solid #333', borderRadius: '8px', padding: '0.85rem 1rem', marginBottom: '0.6rem', background: '#2a2a2a', transition: 'border-color 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = '#444'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = '#333'}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
                    {/* Name + info */}
                    <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => openProfileModal(s)}>
                      <p style={{ margin: 0, fontWeight: 'bold', color: '#fff' }}>{studentName(s)}</p>
                      <p style={{ margin: '0.2rem 0 0', color: '#666', fontSize: '0.82rem' }}>
                        {s.belt_rank ? `${s.belt_rank} belt` : 'No belt set'}
                        {s.phone && <span style={{ marginLeft: '0.6rem', color: '#555' }}>{s.phone}</span>}
                      </p>
                    </div>

                    {/* Token section */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                      {/* Balance badge */}
                      <div style={{
                        background: balance > 0 ? '#1a2a1a' : balance < 0 ? '#2a0a0a' : '#1a1a1a',
                        border: `1px solid ${balance > 0 ? '#2a5a2a' : balance < 0 ? '#5a2a2a' : '#333'}`,
                        borderRadius: '20px', padding: '0.25rem 0.7rem',
                        color: balance > 0 ? '#66cc66' : balance < 0 ? '#cc6666' : '#555',
                        fontSize: '0.82rem', fontWeight: 'bold', whiteSpace: 'nowrap'
                      }}>
                        🪙 {balance}
                      </div>

                      {/* Quick ± buttons */}
                      {!isEditing ? (
                        <>
                          <button
                            onClick={() => setInlineToken({ studentId: s.id, amount: '' })}
                            style={{ padding: '0.25rem 0.55rem', background: '#1a2a1a', border: '1px solid #2a5a2a', borderRadius: '6px', color: '#66cc66', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold' }}
                            title="Add / remove tokens"
                          >±</button>
                          <button
                            onClick={() => openProfileModal(s)}
                            style={{ padding: '0.25rem 0.55rem', background: 'transparent', border: '1px solid #333', borderRadius: '6px', color: '#666', cursor: 'pointer', fontSize: '0.78rem' }}
                          >View</button>
                        </>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <button onClick={() => setInlineToken(t => ({ ...t, amount: String((parseInt(t.amount) || 0) - 1) }))}
                            style={{ width: '28px', height: '28px', background: '#2a0a0a', border: '1px solid #552222', borderRadius: '4px', color: '#cc6666', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold' }}>−</button>
                          <input
                            type="number"
                            value={inlineToken.amount}
                            onChange={e => setInlineToken(t => ({ ...t, amount: e.target.value }))}
                            onKeyDown={e => { if (e.key === 'Enter') submitInlineToken(); if (e.key === 'Escape') setInlineToken(null) }}
                            autoFocus
                            style={{ width: '52px', padding: '0.25rem 0.35rem', background: '#111', border: '1px solid #555', borderRadius: '4px', color: '#fff', fontSize: '0.9rem', textAlign: 'center' }}
                            placeholder="0"
                          />
                          <button onClick={() => setInlineToken(t => ({ ...t, amount: String((parseInt(t.amount) || 0) + 1) }))}
                            style={{ width: '28px', height: '28px', background: '#0a2a0a', border: '1px solid #225522', borderRadius: '4px', color: '#66cc66', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold' }}>+</button>
                          <button onClick={submitInlineToken} disabled={inlineTokenSaving}
                            style={{ padding: '0.25rem 0.55rem', background: '#cc0000', border: 'none', borderRadius: '4px', color: '#fff', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}>
                            {inlineTokenSaving ? '…' : '✓'}
                          </button>
                          <button onClick={() => setInlineToken(null)}
                            style={{ padding: '0.25rem 0.4rem', background: 'transparent', border: '1px solid #333', borderRadius: '4px', color: '#666', cursor: 'pointer', fontSize: '0.85rem' }}>✕</button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* ── BLOCK DATES TAB ── */}
      {activeTab === 'block' && (
        <div>
          {/* Block Date Range form */}
          <details style={{ marginBottom: '1.25rem' }}>
            <summary style={{ color: '#999', fontSize: '0.85rem', cursor: 'pointer', userSelect: 'none', marginBottom: '0.5rem' }}>
              Block full date range ▾
            </summary>
            <div style={{ border: '1px solid #333', borderRadius: '8px', padding: '1.25rem', background: '#2a2a2a', marginTop: '0.5rem' }}>
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
              <button onClick={blockDates} style={{ padding: '0.65rem 1.25rem', background: '#cc0000', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.9rem' }}>
                Block These Dates
              </button>
            </div>
            {blockedRanges.length > 0 && (
              <div style={{ marginTop: '0.75rem' }}>
                {blockedRanges.map(r => (
                  <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #552222', borderRadius: '6px', padding: '0.5rem 0.75rem', marginBottom: '0.4rem', background: '#1a0000' }}>
                    <div>
                      <strong style={{ color: '#fff', fontSize: '0.85rem' }}>{r.start_date} → {r.end_date}</strong>
                      {r.reason && <span style={{ marginLeft: '0.75rem', color: '#666', fontSize: '0.8rem' }}>{r.reason}</span>}
                    </div>
                    <button onClick={() => unblockRange(r)} style={{ padding: '0.2rem 0.6rem', background: 'transparent', color: '#cc0000', border: '1px solid #552222', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}>Unblock</button>
                  </div>
                ))}
              </div>
            )}
          </details>

          {/* Default reason for click-to-block */}
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '1rem' }}>
            <input
              type="text"
              placeholder="Block reason (optional — applies when clicking slots)"
              value={blockSlotReason}
              onChange={e => setBlockSlotReason(e.target.value)}
              style={{ flex: 1, padding: '0.5rem 0.75rem', background: '#1a1a1a', border: '1px solid #444', borderRadius: '6px', color: '#fff', fontSize: '0.85rem' }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#555', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
              <span style={{ width: '12px', height: '12px', background: '#cc0000', borderRadius: '2px', display: 'inline-block' }} /> Blocked
              <span style={{ width: '12px', height: '12px', background: '#1a1a1a', border: '1px solid #333', borderRadius: '2px', display: 'inline-block', marginLeft: '0.4rem' }} /> Available
            </div>
          </div>

          {/* Week navigator */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <button onClick={() => setBlockWeekOffset(w => w - 1)}
              style={{ padding: '0.4rem 1rem', background: '#2a2a2a', color: '#fff', border: '1px solid #444', borderRadius: '6px', cursor: 'pointer' }}>← Prev</button>
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: '#fff', fontWeight: 'bold', fontSize: '0.95rem' }}>{formatBlockWeekLabel()}</div>
              {blockWeekOffset === 0 && <div style={{ color: '#cc0000', fontSize: '0.7rem', marginTop: '2px' }}>THIS WEEK</div>}
            </div>
            <button onClick={() => setBlockWeekOffset(w => w + 1)}
              style={{ padding: '0.4rem 1rem', background: '#2a2a2a', color: '#fff', border: '1px solid #444', borderRadius: '6px', cursor: 'pointer' }}>Next →</button>
          </div>

          {/* Block calendar grid */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ width: '70px', color: '#666', fontSize: '0.7rem', textTransform: 'uppercase', padding: '0.4rem 0.5rem', textAlign: 'left', borderBottom: '1px solid #333' }}>Time</th>
                  {blockWeekDates.map(date => {
                    const isToday = date === today.toISOString().split('T')[0]
                    const d = new Date(date + 'T00:00:00')
                    return (
                      <th key={date} style={{ color: isToday ? '#cc0000' : '#ccc', fontSize: '0.72rem', textTransform: 'uppercase', padding: '0.4rem 0.3rem', textAlign: 'center', borderBottom: '1px solid #333', background: isToday ? '#1a0000' : 'transparent' }}>
                        <div>{DAY_NAMES_FULL[d.getDay()]}</div>
                        <div style={{ fontSize: '0.95rem', fontWeight: 'bold', color: isToday ? '#cc0000' : '#fff' }}>{d.getDate()}</div>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {HOURS.map(hour => (
                  <tr key={hour}>
                    <td style={{ color: '#555', fontSize: '0.72rem', padding: '0.3rem 0.5rem', borderBottom: '1px solid #1f1f1f', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                      {formatHour(hour)}
                    </td>
                    {blockWeekDates.map(date => {
                      const slot = getBlockCellSlot(date, hour)
                      const blocked = slot?.is_blocked
                      const isToday = date === today.toISOString().split('T')[0]
                      return (
                        <td key={date} style={{ padding: '0.25rem', borderBottom: '1px solid #1f1f1f', background: isToday ? '#0d0000' : 'transparent' }}>
                          {slot ? (
                            <button
                              onClick={() => toggleBlockCell(slot)}
                              title={blocked ? `Click to unblock${slot.block_reason ? ': ' + slot.block_reason : ''}` : 'Click to block'}
                              style={{
                                width: '100%', minHeight: '36px', borderRadius: '4px', border: 'none', cursor: 'pointer',
                                background: blocked ? '#4a0000' : '#1a1a1a',
                                outline: blocked ? '1px solid #cc0000' : '1px solid #2a2a2a',
                                color: blocked ? '#cc4444' : '#333',
                                fontSize: '0.7rem', fontWeight: blocked ? 'bold' : 'normal',
                                transition: 'all 0.1s',
                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                              }}
                              onMouseEnter={e => { e.currentTarget.style.outline = '1px solid #cc0000'; e.currentTarget.style.color = blocked ? '#ff6666' : '#cc0000' }}
                              onMouseLeave={e => { e.currentTarget.style.outline = blocked ? '1px solid #cc0000' : '1px solid #2a2a2a'; e.currentTarget.style.color = blocked ? '#cc4444' : '#333' }}
                            >
                              {blocked ? '🔒' : ''}
                            </button>
                          ) : (
                            <div style={{ minHeight: '36px', background: '#111', borderRadius: '4px', opacity: 0.3 }} />
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {/* ── STUDENT PROFILE MODAL ── */}
      {profileModal && (
        <div onClick={e => { if (e.target === e.currentTarget) closeProfileModal() }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, padding: '2rem 1rem', overflowY: 'auto' }}>
          <div style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: '12px', width: '100%', maxWidth: '560px', padding: '1.75rem' }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <div>
                <div style={{ color: '#999', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Student Profile</div>
                <div style={{ color: '#fff', fontWeight: 'bold', fontSize: '1.15rem', marginTop: '0.2rem' }}>{studentName(profileModal)}</div>
                <div style={{ color: '#555', fontSize: '0.8rem', marginTop: '0.1rem' }}>{profileModal.email}</div>
              </div>
              <button onClick={closeProfileModal} style={{ background: 'none', border: 'none', color: '#555', fontSize: '1.5rem', cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>

            {/* Token balance */}
            <div style={{ background: '#111', border: '1px solid #cc0000', borderRadius: '8px', padding: '1rem 1.25rem', marginBottom: '1.25rem' }}>
              <div style={{ color: '#cc0000', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.25rem' }}>Lesson Tokens</div>
              <div style={{ color: '#fff', fontSize: '2rem', fontWeight: 'bold', marginBottom: '0.75rem' }}>{profileTokens}</div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <input
                  type="number" min="1" placeholder="Amount"
                  value={profileTokenAdjust}
                  onChange={e => setProfileTokenAdjust(e.target.value)}
                  style={{ width: '80px', padding: '0.4rem 0.5rem', background: '#2a2a2a', border: '1px solid #444', borderRadius: '4px', color: '#fff', fontSize: '0.9rem' }}
                />
                <input
                  type="text" placeholder="Note (optional)"
                  value={profileTokenNote}
                  onChange={e => setProfileTokenNote(e.target.value)}
                  style={{ flex: 1, minWidth: '120px', padding: '0.4rem 0.5rem', background: '#2a2a2a', border: '1px solid #444', borderRadius: '4px', color: '#fff', fontSize: '0.9rem' }}
                />
                <button onClick={() => applyTokenAdjust(1)} style={{ padding: '0.4rem 0.75rem', background: '#1a4a1a', color: '#66cc66', border: '1px solid #2a6a2a', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>+ Add</button>
                <button onClick={() => applyTokenAdjust(-1)} style={{ padding: '0.4rem 0.75rem', background: '#2a1a1a', color: '#cc6666', border: '1px solid #6a2a2a', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>− Remove</button>
              </div>
            </div>

            {/* Edit form */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
              {[
                { label: 'First Name', key: 'firstName' },
                { label: 'Last Name', key: 'lastName' },
                { label: 'Phone', key: 'phone' },
                { label: 'Date of Birth', key: 'dob', type: 'date' },
              ].map(({ label, key, type }) => (
                <div key={key}>
                  <label style={{ display: 'block', color: '#666', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.25rem' }}>{label}</label>
                  <input
                    type={type || 'text'}
                    value={profileEdit[key] || ''}
                    onChange={e => setProfileEdit(prev => ({ ...prev, [key]: e.target.value }))}
                    style={{ width: '100%', padding: '0.5rem', background: '#2a2a2a', border: '1px solid #444', borderRadius: '4px', color: '#fff', fontSize: '0.9rem', boxSizing: 'border-box' }}
                  />
                </div>
              ))}
              <div>
                <label style={{ display: 'block', color: '#666', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.25rem' }}>Belt Rank</label>
                <select
                  value={profileEdit.beltRank || ''}
                  onChange={e => setProfileEdit(prev => ({ ...prev, beltRank: e.target.value }))}
                  style={{ width: '100%', padding: '0.5rem', background: '#2a2a2a', border: '1px solid #444', borderRadius: '4px', color: '#fff', fontSize: '0.9rem' }}
                >
                  <option value="">— Not set —</option>
                  {['White', 'Yellow', 'Orange', 'Green', 'Blue', 'Purple', 'Brown', 'Red', 'Black'].map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem' }}>
              <button
                onClick={saveProfileEdit}
                disabled={profileSaving}
                style={{ flex: 1, padding: '0.65rem', background: profileSaving ? '#555' : '#cc0000', color: '#fff', border: 'none', borderRadius: '6px', cursor: profileSaving ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}
              >{profileSaving ? 'Saving…' : 'Save Changes'}</button>
              <a
                href={`/admin/book`}
                style={{ padding: '0.65rem 1rem', background: '#2a2a2a', color: '#ccc', border: '1px solid #444', borderRadius: '6px', textDecoration: 'none', fontSize: '0.9rem', display: 'flex', alignItems: 'center' }}
              >+ Book Lesson</a>
            </div>

            {/* Bookings tabs */}
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', borderBottom: '1px solid #2a2a2a', marginBottom: '0.75rem' }}>
                {[
                  { key: 'upcoming', label: 'Upcoming', count: profileBookings.length },
                  { key: 'history', label: 'History', count: profilePastBookings.length },
                ].map(t => (
                  <button key={t.key} onClick={() => setProfileBookingTab(t.key)} style={{
                    padding: '0.5rem 1rem', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: profileBookingTab === t.key ? 'bold' : 'normal',
                    color: profileBookingTab === t.key ? '#fff' : '#555',
                    borderBottom: profileBookingTab === t.key ? '2px solid #cc0000' : '2px solid transparent',
                    marginBottom: '-1px'
                  }}>
                    {t.label}
                    {t.count > 0 && <span style={{ marginLeft: '0.4rem', background: profileBookingTab === t.key ? '#cc0000' : '#333', color: '#fff', borderRadius: '10px', padding: '0 0.4rem', fontSize: '0.7rem' }}>{t.count}</span>}
                  </button>
                ))}
              </div>

              {profileBookingTab === 'upcoming' && (
                profileBookings.length === 0
                  ? <p style={{ color: '#444', fontSize: '0.85rem', margin: 0 }}>No upcoming lessons.</p>
                  : profileBookings.map(b => (
                    <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: '#111', border: '1px solid #2a2a2a', borderRadius: '6px', marginBottom: '0.4rem' }}>
                      <span style={{ color: '#ccc', fontSize: '0.875rem' }}>{b.slots.slot_date} · {formatHour(b.slots.start_hour)}</span>
                      <button
                        onClick={async () => {
                          await supabase.from('bookings').update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancelled_by: 'admin' }).eq('id', b.id)
                          await supabase.from('tokens').insert({ tenant_id: b.tenant_id, student_id: profileModal.id, amount: 1, reason: 'cancelled by admin - refund', booking_id: b.id })
                          setProfileBookings(prev => prev.filter(x => x.id !== b.id))
                          loadData()
                        }}
                        style={{ padding: '0.2rem 0.6rem', background: 'transparent', color: '#884444', border: '1px solid #442222', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}
                      >Cancel</button>
                    </div>
                  ))
              )}

              {profileBookingTab === 'history' && (
                profilePastBookings.length === 0
                  ? <p style={{ color: '#444', fontSize: '0.85rem', margin: 0 }}>No lesson history.</p>
                  : <div style={{ maxHeight: '240px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    {profilePastBookings.map(b => {
                      const cancelled = b.status === 'cancelled'
                      return (
                        <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.45rem 0.75rem', background: cancelled ? '#111' : '#0a1a0a', border: `1px solid ${cancelled ? '#2a2a2a' : '#1a3a1a'}`, borderRadius: '6px' }}>
                          <span style={{ color: cancelled ? '#444' : '#888', fontSize: '0.85rem', textDecoration: cancelled ? 'line-through' : 'none' }}>
                            {b.slots.slot_date} · {formatHour(b.slots.start_hour)}
                          </span>
                          <span style={{ fontSize: '0.72rem', color: cancelled ? '#554444' : '#2a6a2a', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            {cancelled ? 'Cancelled' : 'Completed'}
                          </span>
                        </div>
                      )
                    })}
                  </div>
              )}
            </div>

            {/* Delete student */}
            <div style={{ borderTop: '1px solid #222', paddingTop: '1.25rem' }}>
              {!profileDeleteConfirm ? (
                <button
                  onClick={() => setProfileDeleteConfirm(true)}
                  style={{ width: '100%', padding: '0.6rem', background: 'transparent', border: '1px solid #442222', borderRadius: '6px', color: '#884444', cursor: 'pointer', fontSize: '0.85rem' }}
                >
                  Delete Student Account
                </button>
              ) : (
                <div style={{ background: '#1a0000', border: '1px solid #6a2222', borderRadius: '8px', padding: '1rem' }}>
                  <p style={{ color: '#ff6666', margin: '0 0 0.75rem', fontSize: '0.9rem', fontWeight: 'bold' }}>
                    Delete {studentName(profileModal)}?
                  </p>
                  <p style={{ color: '#884444', margin: '0 0 1rem', fontSize: '0.82rem', lineHeight: 1.5 }}>
                    This will cancel all upcoming bookings and permanently delete the account. This cannot be undone.
                  </p>
                  <div style={{ display: 'flex', gap: '0.6rem' }}>
                    <button
                      onClick={() => setProfileDeleteConfirm(false)}
                      style={{ flex: 1, padding: '0.6rem', background: 'transparent', border: '1px solid #333', borderRadius: '6px', color: '#888', cursor: 'pointer', fontSize: '0.9rem' }}
                    >Cancel</button>
                    <button
                      onClick={deleteStudent}
                      disabled={profileDeleting}
                      style={{ flex: 2, padding: '0.6rem', background: '#cc0000', border: 'none', borderRadius: '6px', color: '#fff', cursor: profileDeleting ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '0.9rem' }}
                    >{profileDeleting ? 'Deleting…' : 'Yes, Delete Account'}</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── ADD STUDENT MODAL ── */}
      {addStudentModal && (
        <div onClick={e => { if (e.target === e.currentTarget) { setAddStudentModal(false); setAddStudentForm({}) } }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: '12px', width: '100%', maxWidth: '480px', padding: '1.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <div>
                <div style={{ color: '#999', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '1px' }}>New Student</div>
                <div style={{ color: '#fff', fontWeight: 'bold', fontSize: '1.1rem', marginTop: '0.2rem' }}>Add Student Account</div>
              </div>
              <button onClick={() => { setAddStudentModal(false); setAddStudentForm({}) }} style={{ background: 'none', border: 'none', color: '#555', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
              {[
                { label: 'First Name *', key: 'firstName', span: false },
                { label: 'Last Name', key: 'lastName', span: false },
                { label: 'Email *', key: 'email', type: 'email', span: true },
                { label: 'Phone', key: 'phone', type: 'tel', span: false },
                { label: 'Date of Birth', key: 'dob', type: 'date', span: false },
              ].map(({ label, key, type, span }) => (
                <div key={key} style={{ gridColumn: span ? '1 / -1' : undefined }}>
                  <label style={{ display: 'block', color: '#666', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.25rem' }}>{label}</label>
                  <input
                    type={type || 'text'}
                    value={addStudentForm[key] || ''}
                    onChange={e => setAddStudentForm(p => ({ ...p, [key]: e.target.value }))}
                    style={{ width: '100%', padding: '0.55rem', background: '#2a2a2a', border: '1px solid #444', borderRadius: '4px', color: '#fff', fontSize: '0.9rem', boxSizing: 'border-box' }}
                  />
                </div>
              ))}
              <div>
                <label style={{ display: 'block', color: '#666', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.25rem' }}>Belt Rank</label>
                <select value={addStudentForm.beltRank || ''} onChange={e => setAddStudentForm(p => ({ ...p, beltRank: e.target.value }))}
                  style={{ width: '100%', padding: '0.55rem', background: '#2a2a2a', border: '1px solid #444', borderRadius: '4px', color: '#fff', fontSize: '0.9rem' }}>
                  <option value="">— Not set —</option>
                  {['White','Yellow','Orange','Green','Blue','Purple','Brown','Red','Black'].map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', color: '#666', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.25rem' }}>Starting Tokens</label>
                <input
                  type="number" min="0" placeholder="0"
                  value={addStudentForm.initialTokens || ''}
                  onChange={e => setAddStudentForm(p => ({ ...p, initialTokens: e.target.value }))}
                  style={{ width: '100%', padding: '0.55rem', background: '#2a2a2a', border: '1px solid #444', borderRadius: '4px', color: '#fff', fontSize: '0.9rem', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            {addStudentError && (
              <p style={{ color: '#ff6666', fontSize: '0.85rem', margin: '0 0 0.75rem', padding: '0.5rem 0.75rem', background: '#2a0a0a', border: '1px solid #6a2a2a', borderRadius: '6px' }}>{addStudentError}</p>
            )}

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.25rem' }}>
              <button onClick={() => { setAddStudentModal(false); setAddStudentForm({}) }}
                style={{ flex: 1, padding: '0.7rem', background: 'transparent', border: '1px solid #333', borderRadius: '6px', color: '#888', cursor: 'pointer' }}>Cancel</button>
              <button onClick={submitAddStudent} disabled={addStudentSaving || !addStudentForm.firstName?.trim() || !addStudentForm.email?.trim()}
                style={{ flex: 2, padding: '0.7rem', background: (addStudentSaving || !addStudentForm.firstName?.trim() || !addStudentForm.email?.trim()) ? '#333' : '#cc0000', color: (addStudentSaving || !addStudentForm.firstName?.trim() || !addStudentForm.email?.trim()) ? '#666' : '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                {addStudentSaving ? 'Creating…' : 'Create Student'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── QUICK-BOOK MODAL ── */}
      {bookModal && (
        <div
          onClick={e => { if (e.target === e.currentTarget) closeBookModal() }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: '1rem'
          }}
        >
          <div style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: '10px', padding: '1.5rem', width: '100%', maxWidth: '420px' }}>
            {bookModalSuccess ? (
              <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>✅</div>
                <div style={{ color: '#fff', fontWeight: 'bold' }}>Booked!</div>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
                  <div>
                    <div style={{ color: '#999', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px' }}>New Booking</div>
                    <div style={{ color: '#fff', fontWeight: 'bold', fontSize: '1.05rem', marginTop: '0.2rem' }}>
                      {new Date(bookModal.date + 'T00:00:00').toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' })} · {formatHour(bookModal.hour)}
                    </div>
                  </div>
                  <button onClick={closeBookModal} style={{ background: 'none', border: 'none', color: '#555', fontSize: '1.4rem', cursor: 'pointer', lineHeight: 1 }}>×</button>
                </div>

                {/* Client / Guest toggle */}
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                  {['Client', 'Guest'].map(mode => (
                    <button
                      key={mode}
                      onClick={() => { setBookModalIsGuest(mode === 'Guest'); setBookModalStudent(null); setBookModalSearch('') }}
                      style={{
                        flex: 1, padding: '0.5rem', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold',
                        background: (mode === 'Guest') === bookModalIsGuest ? '#cc0000' : '#2a2a2a',
                        color: '#fff'
                      }}
                    >{mode}</button>
                  ))}
                </div>

                {!bookModalIsGuest ? (
                  <div style={{ position: 'relative', marginBottom: '0.75rem' }}>
                    <input
                      autoFocus
                      type="text"
                      placeholder="Search by name or phone..."
                      value={bookModalSearch}
                      onChange={e => { setBookModalSearch(e.target.value); setBookModalStudent(null) }}
                      style={{ width: '100%', padding: '0.65rem 0.75rem', background: '#2a2a2a', border: '1px solid #444', borderRadius: '6px', color: '#fff', fontSize: '0.95rem', boxSizing: 'border-box' }}
                    />
                    {!bookModalStudent && bookModalFiltered.length > 0 && bookModalSearch.trim() && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#111', border: '1px solid #333', borderRadius: '0 0 6px 6px', zIndex: 10, maxHeight: '220px', overflowY: 'auto' }}>
                        {bookModalFiltered.map(s => (
                          <div
                            key={s.id}
                            onClick={() => { setBookModalStudent(s); setBookModalSearch(studentName(s)) }}
                            style={{ padding: '0.65rem 0.9rem', cursor: 'pointer', borderBottom: '1px solid #1a1a1a', display: 'flex', justifyContent: 'space-between' }}
                            onMouseEnter={e => e.currentTarget.style.background = '#2a2a2a'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          >
                            <span style={{ color: '#fff' }}>{studentName(s)}</span>
                            <span style={{ color: '#555', fontSize: '0.85rem' }}>{s.phone || ''}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {bookModalStudent && (
                      <div style={{ marginTop: '0.5rem', background: '#2a0000', border: '1px solid #cc0000', borderRadius: '6px', padding: '0.5rem 0.9rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: '#fff', fontWeight: 'bold' }}>{studentName(bookModalStudent)}</span>
                        <button onClick={() => { setBookModalStudent(null); setBookModalSearch('') }} style={{ background: 'none', border: 'none', color: '#884444', cursor: 'pointer', fontSize: '1.1rem' }}>×</button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', gap: '0.6rem' }}>
                      <input
                        autoFocus
                        type="text"
                        placeholder="First name *"
                        value={bookModalGuestFirst}
                        onChange={e => setBookModalGuestFirst(e.target.value)}
                        style={{ flex: 1, padding: '0.6rem 0.75rem', background: '#2a2a2a', border: '1px solid #444', borderRadius: '6px', color: '#fff', fontSize: '0.9rem' }}
                      />
                      <input
                        type="text"
                        placeholder="Last name"
                        value={bookModalGuestLast}
                        onChange={e => setBookModalGuestLast(e.target.value)}
                        style={{ flex: 1, padding: '0.6rem 0.75rem', background: '#2a2a2a', border: '1px solid #444', borderRadius: '6px', color: '#fff', fontSize: '0.9rem' }}
                      />
                    </div>
                    <input
                      type="tel"
                      placeholder="Phone (optional)"
                      value={bookModalGuestPhone}
                      onChange={e => setBookModalGuestPhone(e.target.value)}
                      style={{ width: '100%', padding: '0.6rem 0.75rem', background: '#2a2a2a', border: '1px solid #444', borderRadius: '6px', color: '#fff', fontSize: '0.9rem', boxSizing: 'border-box' }}
                    />
                  </div>
                )}

                {bookModalSlot === undefined && (
                  <p style={{ color: '#666', fontSize: '0.8rem', margin: '0 0 0.75rem' }}>Loading slot…</p>
                )}
                {bookModalSlot === null && (
                  <p style={{ color: '#cc4444', fontSize: '0.85rem', margin: '0 0 0.75rem', padding: '0.5rem 0.75rem', background: '#2a0a0a', border: '1px solid #6a2a2a', borderRadius: '6px' }}>
                    No slot exists for this time. Use the <strong>+ Book Lesson</strong> page instead.
                  </p>
                )}
                {bookModalError && (
                  <p style={{ color: '#ff6666', fontSize: '0.85rem', margin: '0 0 0.75rem', padding: '0.5rem 0.75rem', background: '#2a0a0a', border: '1px solid #6a2a2a', borderRadius: '6px' }}>
                    {bookModalError}
                  </p>
                )}

                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.25rem' }}>
                  <button onClick={closeBookModal} style={{ flex: 1, padding: '0.7rem', background: 'transparent', border: '1px solid #333', borderRadius: '6px', color: '#888', cursor: 'pointer' }}>
                    Cancel
                  </button>
                  <button
                    onClick={confirmBookModal}
                    disabled={!bookModalSlot || bookModalProcessing || (!bookModalIsGuest && !bookModalStudent) || (bookModalIsGuest && !bookModalGuestFirst.trim())}
                    style={{
                      flex: 2, padding: '0.7rem', borderRadius: '6px', border: 'none',
                      background: (bookModalSlot && ((!bookModalIsGuest && bookModalStudent) || (bookModalIsGuest && bookModalGuestFirst.trim()))) ? '#cc0000' : '#333',
                      color: (bookModalSlot && ((!bookModalIsGuest && bookModalStudent) || (bookModalIsGuest && bookModalGuestFirst.trim()))) ? '#fff' : '#666',
                      cursor: (bookModalSlot && ((!bookModalIsGuest && bookModalStudent) || (bookModalIsGuest && bookModalGuestFirst.trim()))) ? 'pointer' : 'not-allowed',
                      fontWeight: 'bold', fontSize: '0.95rem'
                    }}
                  >
                    {bookModalProcessing ? 'Booking…' : 'Confirm Booking'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  )
}
