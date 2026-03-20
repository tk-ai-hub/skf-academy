'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'

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

function sName(s) {
  if (s?.first_name) return `${s.first_name} ${s.last_name || ''}`.trim()
  return s?.email || 'Unknown'
}

const inputStyle = {
  width: '100%',
  padding: '0.75rem',
  background: '#2a2a2a',
  border: '1px solid #444',
  borderRadius: '6px',
  color: '#fff',
  fontSize: '1rem',
  boxSizing: 'border-box'
}

const labelStyle = {
  display: 'block',
  color: '#999',
  fontSize: '0.75rem',
  letterSpacing: '1px',
  textTransform: 'uppercase',
  marginBottom: '0.4rem'
}

const cardStyle = {
  background: '#2a2a2a',
  border: '1px solid #333',
  borderRadius: '8px',
  padding: '1.25rem'
}

export default function AdminBook() {
  const [step, setStep] = useState(1)

  // Student selection
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [allStudents, setAllStudents] = useState([])
  const [selectedStudent, setSelectedStudent] = useState(null)
  const [isNewClient, setIsNewClient] = useState(false)
  const [guestFirstName, setGuestFirstName] = useState('')
  const [guestLastName, setGuestLastName] = useState('')
  const [guestPhone, setGuestPhone] = useState('')

  // Slot selection
  const [slots, setSlots] = useState([])
  const [bookedSlotIds, setBookedSlotIds] = useState([])
  const [availableDates, setAvailableDates] = useState([])
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedSlot, setSelectedSlot] = useState(null)

  // UI state
  const [message, setMessage] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [success, setSuccess] = useState(null)

  // Admin auth check
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data?.user) { window.location.href = '/admin-login'; return }
      const { data: profile } = await supabase.from('users').select('role').eq('id', data.user.id).single()
      if (profile?.role !== 'admin') { await supabase.auth.signOut(); window.location.href = '/admin-login'; return }
    })
  }, [])

  // Load students and slots
  useEffect(() => {
    async function load() {
      const { data: studentData } = await supabase
        .from('users')
        .select('id, first_name, last_name, full_name, email, phone')
        .neq('role', 'admin')
        .order('first_name', { ascending: true })
      setAllStudents(studentData || [])

      const { data: bookedData } = await supabase
        .from('bookings')
        .select('slot_id')
        .eq('status', 'confirmed')
      setBookedSlotIds((bookedData || []).map(b => b.slot_id))

      const today = new Date().toISOString().split('T')[0]
      const ninetyOut = new Date()
      ninetyOut.setDate(ninetyOut.getDate() + 90)
      const maxDate = ninetyOut.toISOString().split('T')[0]

      const alreadyBooked = (bookedData || []).map(b => b.slot_id)
      const { data: slotData } = await supabase
        .from('slots')
        .select('*')
        .eq('is_blocked', false)
        .gte('slot_date', today)
        .lte('slot_date', maxDate)
        .not('id', 'in', `(${alreadyBooked.length > 0 ? alreadyBooked.join(',') : '00000000-0000-0000-0000-000000000000'})`)
        .order('slot_date', { ascending: true })
        .order('start_hour', { ascending: true })

      setSlots(slotData || [])
      const dates = [...new Set((slotData || []).map(s => s.slot_date))]
      setAvailableDates(dates)
      if (dates.length > 0) setSelectedDate(dates[0])
    }
    load()
  }, [])

  // Live search filter
  useEffect(() => {
    const q = searchQuery.toLowerCase().trim()
    if (!q) { setSearchResults([]); return }
    const filtered = allStudents.filter(s => {
      const name = sName(s).toLowerCase()
      const phone = (s.phone || '').replace(/\D/g, '')
      return name.includes(q) || phone.includes(q.replace(/\D/g, ''))
    })
    setSearchResults(filtered.slice(0, 8))
  }, [searchQuery, allStudents])

  const slotsForDate = slots.filter(s => s.slot_date === selectedDate)

  function selectStudent(student) {
    setSelectedStudent(student)
    setSearchQuery(sName(student))
    setSearchResults([])
    setIsNewClient(false)
    setMessage('')
  }

  function startNewClient() {
    setIsNewClient(true)
    setSelectedStudent(null)
    setSearchQuery('')
    setSearchResults([])
    setGuestFirstName('')
    setGuestLastName('')
    setGuestPhone('')
    setMessage('')
  }

  function studentReady() {
    if (isNewClient) return guestFirstName.trim().length > 0
    return selectedStudent !== null
  }

  function goToStep2() {
    if (!studentReady()) { setMessage('Please select or enter a client.'); return }
    setMessage('')
    setStep(2)
  }

  function goToStep3() {
    if (!selectedSlot) { setMessage('Please select a time slot.'); return }
    setMessage('')
    setStep(3)
  }

  async function confirmBooking() {
    if (!selectedSlot || isProcessing) return
    setIsProcessing(true)
    setMessage('')

    const payload = {
      slotId: selectedSlot.id,
      ...(isNewClient
        ? { guestFirstName: guestFirstName.trim(), guestLastName: guestLastName.trim(), guestPhone: guestPhone.trim() }
        : { studentId: selectedStudent.id }
      )
    }

    try {
      const res = await fetch('/api/admin-book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage('Error: ' + (data.error || 'Something went wrong'))
        return
      }
      setSuccess({
        studentName: data.studentName,
        date: selectedSlot.slot_date,
        hour: selectedSlot.start_hour
      })
      // Remove booked slot from local state
      setSlots(prev => prev.filter(s => s.id !== selectedSlot.id))
    } catch (err) {
      setMessage('Network error: ' + err.message)
    } finally {
      setIsProcessing(false)
    }
  }

  function bookAnother() {
    setSuccess(null)
    setStep(1)
    setSelectedStudent(null)
    setSelectedSlot(null)
    setSearchQuery('')
    setGuestFirstName('')
    setGuestLastName('')
    setGuestPhone('')
    setIsNewClient(false)
    setMessage('')
  }

  const clientLabel = isNewClient
    ? [guestFirstName, guestLastName].filter(Boolean).join(' ') || 'New Client'
    : selectedStudent ? sName(selectedStudent) : null

  return (
    <main style={{ maxWidth: '600px', margin: '0 auto', padding: '2rem 1rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <a href="/admin" style={{ color: '#666', textDecoration: 'none', fontSize: '0.9rem' }}>← Admin</a>
        <h2 style={{ color: '#fff', margin: 0, letterSpacing: '1px', textTransform: 'uppercase', fontSize: '1.2rem' }}>
          Book a Lesson
        </h2>
      </div>

      {/* Success screen */}
      {success && (
        <div style={{ ...cardStyle, border: '1px solid #2a8a4e', textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>✅</div>
          <h3 style={{ color: '#fff', margin: '0 0 0.5rem' }}>Booking Confirmed</h3>
          <p style={{ color: '#ccc', margin: '0 0 0.25rem' }}><strong style={{ color: '#fff' }}>{success.studentName}</strong></p>
          <p style={{ color: '#cc0000', margin: '0 0 1.5rem' }}>
            {formatDate(success.date)} · {formatHour(success.hour)}
          </p>
          <p style={{ color: '#666', fontSize: '0.85rem', margin: '0 0 1.5rem' }}>Added to Google Calendar</p>
          <button onClick={bookAnother} style={{ background: '#cc0000', color: '#fff', border: 'none', borderRadius: '6px', padding: '0.75rem 2rem', cursor: 'pointer', fontSize: '1rem' }}>
            Book Another
          </button>
        </div>
      )}

      {!success && (
        <>
          {/* Step indicators */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem' }}>
            {['Client', 'Date & Time', 'Confirm'].map((label, i) => {
              const n = i + 1
              const active = step === n
              const done = step > n
              return (
                <div
                  key={n}
                  onClick={() => done ? setStep(n) : undefined}
                  style={{ flex: 1, textAlign: 'center', cursor: done ? 'pointer' : 'default' }}
                >
                  <div style={{
                    width: '28px', height: '28px', borderRadius: '50%', margin: '0 auto 0.3rem',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.85rem', fontWeight: 'bold',
                    background: active ? '#cc0000' : done ? '#333' : '#1a1a1a',
                    border: `2px solid ${active ? '#cc0000' : done ? '#555' : '#333'}`,
                    color: active ? '#fff' : done ? '#aaa' : '#555'
                  }}>
                    {done ? '✓' : n}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: active ? '#cc0000' : done ? '#888' : '#555', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    {label}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Step 1: Select client */}
          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={cardStyle}>
                <h3 style={{ color: '#fff', margin: '0 0 1rem', fontSize: '1rem' }}>Select Existing Student</h3>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    placeholder="Search by name or phone..."
                    value={searchQuery}
                    onChange={e => { setSearchQuery(e.target.value); setSelectedStudent(null) }}
                    style={inputStyle}
                    autoComplete="off"
                  />
                  {searchResults.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#1a1a1a', border: '1px solid #444', borderRadius: '0 0 6px 6px', zIndex: 10, maxHeight: '260px', overflowY: 'auto' }}>
                      {searchResults.map(s => (
                        <div
                          key={s.id}
                          onClick={() => selectStudent(s)}
                          style={{ padding: '0.75rem 1rem', cursor: 'pointer', borderBottom: '1px solid #2a2a2a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                          onMouseEnter={e => e.currentTarget.style.background = '#2a2a2a'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <span style={{ color: '#fff' }}>{sName(s)}</span>
                          <span style={{ color: '#666', fontSize: '0.85rem' }}>{s.phone || 'No phone'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {selectedStudent && (
                  <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: '#1a1a1a', border: '1px solid #cc0000', borderRadius: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ color: '#fff', fontWeight: 'bold' }}>{sName(selectedStudent)}</div>
                      <div style={{ color: '#666', fontSize: '0.85rem' }}>{selectedStudent.phone || 'No phone'}</div>
                    </div>
                    <button onClick={() => { setSelectedStudent(null); setSearchQuery('') }} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: '1.2rem' }}>×</button>
                  </div>
                )}
              </div>

              <div style={{ textAlign: 'center', color: '#555', fontSize: '0.85rem' }}>— or —</div>

              <div style={cardStyle}>
                <h3 style={{ color: '#fff', margin: '0 0 1rem', fontSize: '1rem' }}>New Walk-in / Phone Client</h3>
                {!isNewClient ? (
                  <button
                    onClick={startNewClient}
                    style={{ width: '100%', padding: '0.75rem', background: 'transparent', border: '1px dashed #555', borderRadius: '6px', color: '#aaa', cursor: 'pointer', fontSize: '0.95rem' }}
                  >
                    + Enter new client details
                  </button>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                      <div style={{ flex: 1 }}>
                        <label style={labelStyle}>First Name *</label>
                        <input
                          type="text"
                          placeholder="First name"
                          value={guestFirstName}
                          onChange={e => setGuestFirstName(e.target.value)}
                          style={inputStyle}
                          autoFocus
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={labelStyle}>Last Name</label>
                        <input
                          type="text"
                          placeholder="Last name"
                          value={guestLastName}
                          onChange={e => setGuestLastName(e.target.value)}
                          style={inputStyle}
                        />
                      </div>
                    </div>
                    <div>
                      <label style={labelStyle}>Phone</label>
                      <input
                        type="tel"
                        placeholder="Phone number"
                        value={guestPhone}
                        onChange={e => setGuestPhone(e.target.value)}
                        style={inputStyle}
                      />
                    </div>
                    <button
                      onClick={() => { setIsNewClient(false); setGuestFirstName(''); setGuestLastName(''); setGuestPhone('') }}
                      style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: '0.85rem', textAlign: 'left' }}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>

              {message && <p style={{ color: '#cc0000', margin: 0, fontSize: '0.9rem' }}>{message}</p>}

              <button
                onClick={goToStep2}
                disabled={!studentReady()}
                style={{
                  width: '100%', padding: '0.875rem', borderRadius: '6px', border: 'none',
                  background: studentReady() ? '#cc0000' : '#333',
                  color: studentReady() ? '#fff' : '#666',
                  cursor: studentReady() ? 'pointer' : 'not-allowed',
                  fontSize: '1rem', fontWeight: 'bold', letterSpacing: '1px', textTransform: 'uppercase'
                }}
              >
                Next: Pick a Slot
              </button>
            </div>
          )}

          {/* Step 2: Date + time */}
          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ ...cardStyle, background: '#1a1a1a', border: '1px solid #cc0000' }}>
                <div style={{ color: '#999', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.25rem' }}>Booking for</div>
                <div style={{ color: '#fff', fontWeight: 'bold' }}>{clientLabel}</div>
              </div>

              <div style={cardStyle}>
                <label style={labelStyle}>Select Date</label>
                {availableDates.length === 0 ? (
                  <p style={{ color: '#666', margin: 0 }}>No available slots in the next 90 days.</p>
                ) : (
                  <select
                    value={selectedDate}
                    onChange={e => { setSelectedDate(e.target.value); setSelectedSlot(null) }}
                    style={inputStyle}
                  >
                    {availableDates.map(d => (
                      <option key={d} value={d}>{formatDate(d)}</option>
                    ))}
                  </select>
                )}
              </div>

              {selectedDate && (
                <div style={cardStyle}>
                  <label style={{ ...labelStyle, marginBottom: '0.75rem' }}>Available Times — {formatDateShort(selectedDate)}</label>
                  {slotsForDate.length === 0 ? (
                    <p style={{ color: '#666', margin: 0 }}>No slots available on this date.</p>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                      {slotsForDate.map(slot => {
                        const active = selectedSlot?.id === slot.id
                        return (
                          <button
                            key={slot.id}
                            onClick={() => setSelectedSlot(prev => prev?.id === slot.id ? null : slot)}
                            style={{
                              padding: '0.75rem 0.5rem',
                              borderRadius: '6px',
                              border: `2px solid ${active ? '#cc0000' : '#444'}`,
                              background: active ? '#cc0000' : '#1a1a1a',
                              color: active ? '#fff' : '#ccc',
                              cursor: 'pointer',
                              fontSize: '0.9rem',
                              fontWeight: active ? 'bold' : 'normal',
                              transition: 'all 0.15s'
                            }}
                          >
                            {formatHour(slot.start_hour)}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {message && <p style={{ color: '#cc0000', margin: 0, fontSize: '0.9rem' }}>{message}</p>}

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button onClick={() => setStep(1)} style={{ flex: 1, padding: '0.875rem', borderRadius: '6px', border: '1px solid #444', background: 'transparent', color: '#aaa', cursor: 'pointer', fontSize: '0.95rem' }}>
                  Back
                </button>
                <button
                  onClick={goToStep3}
                  disabled={!selectedSlot}
                  style={{
                    flex: 2, padding: '0.875rem', borderRadius: '6px', border: 'none',
                    background: selectedSlot ? '#cc0000' : '#333',
                    color: selectedSlot ? '#fff' : '#666',
                    cursor: selectedSlot ? 'pointer' : 'not-allowed',
                    fontSize: '1rem', fontWeight: 'bold', letterSpacing: '1px', textTransform: 'uppercase'
                  }}
                >
                  Review Booking
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Confirm */}
          {step === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={cardStyle}>
                <h3 style={{ color: '#fff', margin: '0 0 1.25rem', fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Booking Summary</h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#666', fontSize: '0.85rem' }}>Client</span>
                    <span style={{ color: '#fff', fontWeight: 'bold' }}>{clientLabel}</span>
                  </div>
                  {isNewClient && guestPhone && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#666', fontSize: '0.85rem' }}>Phone</span>
                      <span style={{ color: '#fff' }}>{guestPhone}</span>
                    </div>
                  )}
                  {!isNewClient && selectedStudent?.phone && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#666', fontSize: '0.85rem' }}>Phone</span>
                      <span style={{ color: '#fff' }}>{selectedStudent.phone}</span>
                    </div>
                  )}
                  <div style={{ borderTop: '1px solid #333', paddingTop: '0.75rem', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#666', fontSize: '0.85rem' }}>Date</span>
                    <span style={{ color: '#fff' }}>{formatDate(selectedSlot.slot_date)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#666', fontSize: '0.85rem' }}>Time</span>
                    <span style={{ color: '#cc0000', fontWeight: 'bold', fontSize: '1.1rem' }}>{formatHour(selectedSlot.start_hour)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#666', fontSize: '0.85rem' }}>Calendar</span>
                    <span style={{ color: '#888', fontSize: '0.85rem' }}>Google Calendar ✓</span>
                  </div>
                  {isNewClient && (
                    <div style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: '4px', padding: '0.6rem 0.75rem', marginTop: '0.25rem' }}>
                      <p style={{ color: '#666', fontSize: '0.8rem', margin: 0 }}>
                        A new student account will be created for this client. No tokens will be deducted — add tokens from the Students tab if needed.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {message && <p style={{ color: '#cc0000', margin: 0, fontSize: '0.9rem' }}>{message}</p>}

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button onClick={() => setStep(2)} style={{ flex: 1, padding: '0.875rem', borderRadius: '6px', border: '1px solid #444', background: 'transparent', color: '#aaa', cursor: 'pointer', fontSize: '0.95rem' }}>
                  Back
                </button>
                <button
                  onClick={confirmBooking}
                  disabled={isProcessing}
                  style={{
                    flex: 2, padding: '0.875rem', borderRadius: '6px', border: 'none',
                    background: isProcessing ? '#7a0000' : '#cc0000',
                    color: '#fff',
                    cursor: isProcessing ? 'not-allowed' : 'pointer',
                    fontSize: '1rem', fontWeight: 'bold', letterSpacing: '1px', textTransform: 'uppercase'
                  }}
                >
                  {isProcessing ? 'Booking...' : 'Confirm Booking'}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </main>
  )
}
