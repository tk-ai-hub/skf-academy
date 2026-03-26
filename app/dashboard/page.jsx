'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

function formatHour(h) {
  if (h < 12) return `${h}:00 AM`
  if (h === 12) return `12:00 PM`
  return `${h - 12}:00 PM`
}

function isWithin24Hours(slotDate, slotHour) {
  const slotTime = new Date(`${slotDate}T${String(slotHour).padStart(2, '0')}:00:00`)
  const now = new Date()
  return (slotTime - now) < 24 * 60 * 60 * 1000
}

const RECURRING_CLASSES = [
  { dayOfWeek: 2, hour: 18, label: 'Kids Class', color: '#1a8a4e', border: '#2a6a3e', text: '#66cc99' },
  { dayOfWeek: 4, hour: 18, label: 'Kids Class', color: '#1a8a4e', border: '#2a6a3e', text: '#66cc99' },
  { dayOfWeek: 2, hour: 21, label: 'Skill Development Class', color: '#1a3a7a', border: '#2a5aaa', text: '#7ab8f5' },
  { dayOfWeek: 4, hour: 21, label: 'Skill Development Class', color: '#1a3a7a', border: '#2a5aaa', text: '#7ab8f5' },
]

function localDateStr(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function getUpcomingGroupClasses(weeksAhead = 8) {
  const classes = []
  const now = new Date()
  for (let i = 0; i < weeksAhead * 7; i++) {
    const d = new Date()
    d.setDate(now.getDate() + i)
    d.setHours(0, 0, 0, 0)
    const dow = d.getDay()
    const dateStr = localDateStr(d)
    RECURRING_CLASSES.forEach(c => {
      if (c.dayOfWeek === dow) {
        const classTime = new Date(d)
        classTime.setHours(c.hour, 0, 0, 0)
        if (classTime > now) {
          classes.push({ type: 'class', date: dateStr, hour: c.hour, label: c.label, color: c.color, border: c.border, text: c.text })
        }
      }
    })
  }
  return classes
}

export default function Dashboard() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [bookings, setBookings] = useState([])
  const [balance, setBalance] = useState(0)
  const [cancelPrompt, setCancelPrompt] = useState(null)
  const [isProcessing, setIsProcessing] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/login'; return }
      setUser(user)
      const { data: profileData } = await supabase.from('users').select('first_name, last_name, phone, belt_rank').eq('id', user.id).single()
      setProfile(profileData)
      const { data: bookingData } = await supabase
        .from('bookings')
        .select(`id, status, booked_at, tenant_id, student_id, is_recurring, recurring_group_id, slots!bookings_slot_id_fkey ( id, slot_date, start_hour )`)
        .eq('student_id', user.id)
        .in('status', ['confirmed', 'pending_token'])
        .order('booked_at', { ascending: true })
      setBookings((bookingData || []).filter(b => b.slots))
      const { data: tokenData } = await supabase.from('tokens').select('amount').eq('student_id', user.id)
      const total = (tokenData || []).reduce((sum, t) => sum + t.amount, 0)
      setBalance(total)
    }
    load()
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  function handleCancelClick(booking) {
    if (isProcessing) return
    const within24 = isWithin24Hours(booking.slots.slot_date, booking.slots.start_hour)
    const isPending = booking.status === 'pending_token'
    if (booking.is_recurring && booking.recurring_group_id) {
      const seriesBookings = bookings.filter(b => b.recurring_group_id === booking.recurring_group_id && b.id !== booking.id)
      if (seriesBookings.length > 0) {
        setCancelPrompt({ booking, hasSeries: true, seriesCount: seriesBookings.length + 1, within24, isPending })
        return
      }
    }
    setCancelPrompt({ booking, hasSeries: false, within24, isPending })
  }

  async function doCancel(booking, cancelSeries) {
    if (isProcessing) return
    setIsProcessing(true)
    setCancelPrompt(null)
    try {
      const studentName = profile?.first_name ? `${profile.last_name || ''} ${profile.first_name}`.trim() : user.email

      if (cancelSeries && booking.recurring_group_id) {
        const seriesBookings = bookings.filter(b => b.recurring_group_id === booking.recurring_group_id)
        let refunded = 0
        for (const b of seriesBookings) {
          const within24 = isWithin24Hours(b.slots.slot_date, b.slots.start_hour)
          await supabase.from('bookings').update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancelled_within_24h: within24 }).eq('id', b.id)
          if (b.status === 'confirmed' && !within24) {
            await supabase.from('tokens').insert({ tenant_id: b.tenant_id, student_id: b.student_id, amount: 1, reason: 'recurring series cancelled - refund', booking_id: b.id })
            refunded++
          }
          await fetch('/api/send-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'cancellation', studentEmail: user.email, studentName, phone: profile?.phone || '', date: b.slots.slot_date, time: formatHour(b.slots.start_hour), hour: b.slots.start_hour }) })
        }
        setBookings(prev => prev.filter(b => b.recurring_group_id !== booking.recurring_group_id))
        setBalance(prev => prev + refunded)
      } else {
        const within24 = isWithin24Hours(booking.slots.slot_date, booking.slots.start_hour)
        await supabase.from('bookings').update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancelled_within_24h: within24 }).eq('id', booking.id)
        if (booking.status === 'confirmed' && !within24) {
          await supabase.from('tokens').insert({ tenant_id: booking.tenant_id, student_id: booking.student_id, amount: 1, reason: 'lesson cancelled - refund', booking_id: booking.id })
          setBalance(prev => prev + 1)
        }
        await fetch('/api/send-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'cancellation', studentEmail: user.email, studentName, phone: profile?.phone || '', date: booking.slots.slot_date, time: formatHour(booking.slots.start_hour), hour: booking.slots.start_hour }) })
        setBookings(prev => prev.filter(b => b.id !== booking.id))
      }
    } finally {
      setIsProcessing(false)
    }
  }

  async function handleReschedule(booking) {
    if (isProcessing) return
    const within24 = isWithin24Hours(booking.slots.slot_date, booking.slots.start_hour)
    setIsProcessing(true)
    try {
      const studentName = profile?.first_name ? `${profile.last_name || ''} ${profile.first_name}`.trim() : user.email
      await supabase.from('bookings').update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancelled_within_24h: within24 }).eq('id', booking.id)
      if (!within24) {
        await supabase.from('tokens').insert({ tenant_id: booking.tenant_id, student_id: booking.student_id, amount: 1, reason: 'lesson rescheduled - refund', booking_id: booking.id })
      }
      await fetch('/api/send-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'cancellation', studentEmail: user.email, studentName, phone: profile?.phone || '', date: booking.slots.slot_date, time: formatHour(booking.slots.start_hour), hour: booking.slots.start_hour }) })
      window.location.href = '/book'
    } finally {
      setIsProcessing(false)
    }
  }

  function groupBookings(bookings) {
    const seen = new Set()
    const result = []
    for (const b of bookings) {
      if (b.is_recurring && b.recurring_group_id) {
        if (!seen.has(b.recurring_group_id)) {
          seen.add(b.recurring_group_id)
          const series = bookings.filter(x => x.recurring_group_id === b.recurring_group_id)
          result.push({ type: 'series', groupId: b.recurring_group_id, bookings: series })
        }
      } else {
        result.push({ type: 'single', booking: b })
      }
    }
    return result
  }

  const grouped = groupBookings(bookings)
  const displayName = profile?.first_name ? `${profile.first_name} ${profile.last_name || ''}`.trim() : user?.email

  // Merge private bookings + group class reminders, sorted by date/time
  const upcomingClasses = getUpcomingGroupClasses(8)
  const allItems = [
    ...grouped.map(g => {
      const date = g.type === 'single' ? g.booking.slots.slot_date : g.bookings[0].slots.slot_date
      const hour = g.type === 'single' ? g.booking.slots.start_hour : g.bookings[0].slots.start_hour
      return { ...g, sortKey: `${date}T${String(hour).padStart(2, '0')}` }
    }),
    ...upcomingClasses.map(c => ({ ...c, sortKey: `${c.date}T${String(c.hour).padStart(2, '0')}` }))
  ].sort((a, b) => a.sortKey.localeCompare(b.sortKey))

  return (
    <main>
      {user && (
        <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <p style={{ color: '#999', margin: 0 }}>Welcome back,</p>
            <h2 style={{ color: '#fff', margin: '0.25rem 0 0', fontSize: '1.5rem' }}>{displayName}</h2>
            {profile?.belt_rank && <p style={{ color: '#cc0000', fontSize: '0.8rem', letterSpacing: '2px', textTransform: 'uppercase', margin: '0.25rem 0 0' }}>{profile.belt_rank} belt</p>}
          </div>
          <button onClick={handleLogout} style={{ padding: '0.4rem 0.9rem', background: 'transparent', color: '#666', border: '1px solid #444', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}>Sign Out</button>
        </div>
      )}

      <div className="token-badge" style={{ marginBottom: '2rem' }}>
        <div>
          <div style={{ color: 'var(--red)', fontSize: '0.7rem', letterSpacing: '2px', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.25rem' }}>Lesson Tokens</div>
          <div style={{ fontSize: '2.5rem', fontWeight: 800, color: '#fff', lineHeight: 1 }}>{balance}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: 'var(--text3)', fontSize: '0.78rem' }}>Monthly renewal</div>
          <div style={{ color: 'var(--red)', fontSize: '0.85rem', fontWeight: 600 }}>4 tokens / month</div>
        </div>
      </div>

      {/* Cancel Prompt Modal */}
      {cancelPrompt && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: '#1a1a1a', border: '1px solid #cc0000', borderRadius: '12px', padding: '1.75rem', maxWidth: '400px', width: '100%' }}>
            <h3 style={{ color: '#fff', margin: '0 0 0.5rem', fontSize: '1.1rem' }}>Cancel Booking</h3>
            {cancelPrompt.isPending && (
              <div style={{ background: '#1e1a00', border: '1px solid #665500', borderRadius: '6px', padding: '0.75rem', marginBottom: '1rem' }}>
                <p style={{ margin: 0, color: '#ffdd44', fontSize: '0.85rem' }}>This slot is reserved but no token has been charged yet. Cancelling releases the reservation.</p>
              </div>
            )}
            {!cancelPrompt.isPending && cancelPrompt.within24 && (
              <div style={{ background: '#2a1500', border: '1px solid #aa6600', borderRadius: '6px', padding: '0.75rem', marginBottom: '1rem' }}>
                <p style={{ margin: 0, color: '#ffaa44', fontSize: '0.85rem' }}>⚠️ This lesson is within 24 hours. Your token will <strong>not</strong> be refunded.</p>
              </div>
            )}
            {cancelPrompt.hasSeries ? (
              <>
                <p style={{ color: '#999', fontSize: '0.9rem', marginBottom: '1.25rem' }}>This is part of a recurring series ({cancelPrompt.seriesCount} lessons). What would you like to cancel?</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <button onClick={() => doCancel(cancelPrompt.booking, false)} disabled={isProcessing} style={{ padding: '0.75rem', background: '#2a2a2a', color: '#fff', border: '1px solid #444', borderRadius: '8px', cursor: 'pointer', textAlign: 'left' }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>This lesson only</div>
                    <div style={{ color: '#666', fontSize: '0.8rem' }}>{cancelPrompt.within24 ? 'No refund — within 24 hours' : 'Refund 1 token'}</div>
                  </button>
                  <button onClick={() => doCancel(cancelPrompt.booking, true)} disabled={isProcessing} style={{ padding: '0.75rem', background: '#2a0000', color: '#fff', border: '1px solid #cc0000', borderRadius: '8px', cursor: 'pointer', textAlign: 'left' }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>All {cancelPrompt.seriesCount} lessons</div>
                    <div style={{ color: '#cc6666', fontSize: '0.8rem' }}>Tokens refunded for lessons outside 24hr window</div>
                  </button>
                  <button onClick={() => setCancelPrompt(null)} style={{ padding: '0.6rem', background: 'transparent', color: '#666', border: '1px solid #333', borderRadius: '8px', cursor: 'pointer' }}>Keep my booking</button>
                </div>
              </>
            ) : (
              <>
                <p style={{ color: '#999', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
                  Cancel {cancelPrompt.booking.slots.slot_date} at {formatHour(cancelPrompt.booking.slots.start_hour)}?
                  {cancelPrompt.within24 ? ' No token refund.' : ' 1 token will be refunded.'}
                </p>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button onClick={() => doCancel(cancelPrompt.booking, false)} disabled={isProcessing} style={{ flex: 1, padding: '0.75rem', background: '#cc0000', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
                    {isProcessing ? 'Cancelling...' : 'Yes, Cancel'}
                  </button>
                  <button onClick={() => setCancelPrompt(null)} style={{ flex: 1, padding: '0.75rem', background: 'transparent', color: '#666', border: '1px solid #333', borderRadius: '8px', cursor: 'pointer' }}>Keep it</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <h2 style={{ color: 'var(--text)', borderBottom: '1px solid var(--border)', paddingBottom: '0.6rem', marginBottom: '1.25rem', fontSize: '1.1rem', letterSpacing: '0.5px', textTransform: 'uppercase', fontFamily: 'Georgia, serif' }}>Upcoming Lessons</h2>

      {allItems.length === 0 ? (
        <p style={{ color: '#666' }}>No upcoming lessons booked.</p>
      ) : (
        allItems.map((group, idx) => {
          if (group.type === 'class') {
            const isToday = group.date === localDateStr(new Date())
            const tmrw = new Date(); tmrw.setDate(tmrw.getDate() + 1)
            const isTomorrow = group.date === localDateStr(tmrw)
            return (
              <div key={`class-${group.date}-${group.hour}`} style={{
                background: `linear-gradient(135deg, ${group.color}33, #111)`,
                border: `2px solid ${group.border}`,
                borderRadius: '10px',
                padding: '1rem 1.25rem',
                marginBottom: '0.75rem',
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
              }}>
                <div style={{ fontSize: '1.8rem', flexShrink: 0 }}>
                  {group.label === 'Kids Class' ? '🥋' : '⚡'}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.2rem' }}>
                    <span style={{ color: group.text, fontWeight: 800, fontSize: '1rem', letterSpacing: '0.5px' }}>{group.label}</span>
                    {isToday && <span style={{ background: group.border, color: '#fff', fontSize: '0.65rem', fontWeight: 700, padding: '2px 7px', borderRadius: '10px', letterSpacing: '1px', textTransform: 'uppercase' }}>TODAY</span>}
                    {isTomorrow && <span style={{ background: '#333', color: '#aaa', fontSize: '0.65rem', fontWeight: 700, padding: '2px 7px', borderRadius: '10px', letterSpacing: '1px', textTransform: 'uppercase' }}>TOMORROW</span>}
                  </div>
                  <div style={{ color: '#aaa', fontSize: '0.85rem' }}>
                    {new Date(group.date + 'T00:00:00').toLocaleDateString('en-CA', { weekday: 'long', month: 'short', day: 'numeric' })}
                    <span style={{ color: group.text, fontWeight: 600, marginLeft: '0.5rem' }}>{formatHour(group.hour)}</span>
                  </div>
                </div>
                <div style={{ color: group.text, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700, textAlign: 'right', flexShrink: 0 }}>
                  Group<br />Class
                </div>
              </div>
            )
          }

          if (group.type === 'single') {
            const b = group.booking
            const within24 = isWithin24Hours(b.slots.slot_date, b.slots.start_hour)
            const isPending = b.status === 'pending_token'
            return (
              <div key={b.id} className={`booking-card${isPending ? ' pending' : ''}`}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
                      <span style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text)' }}>{b.slots.slot_date}</span>
                      <span style={{ color: 'var(--red)', fontWeight: 600 }}>·</span>
                      <span style={{ color: 'var(--red)', fontWeight: 600, fontSize: '1rem' }}>{formatHour(b.slots.start_hour)}</span>
                      {isPending && <span className="badge badge-pending">Awaiting Token</span>}
                    </div>
                    <p style={{ margin: 0, color: 'var(--text3)', fontSize: '0.82rem' }}>
                      {isPending ? 'Reserved · confirms automatically when token is added' : 'Private Lesson'}
                    </p>
                    {!isPending && within24 && <p style={{ margin: '0.3rem 0 0', color: '#f97316', fontSize: '0.78rem' }}>⚠️ Within 24 hrs — no refund if cancelled</p>}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                    {!isPending && <button onClick={() => handleReschedule(b)} disabled={isProcessing} style={{ padding: '0.45rem 0.9rem', background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>Reschedule</button>}
                    <button onClick={() => handleCancelClick(b)} disabled={isProcessing} style={{ padding: '0.45rem 0.9rem', background: 'transparent', color: 'var(--red)', border: '1px solid var(--red)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: '0.85rem' }}>Cancel</button>
                  </div>
                </div>
              </div>
            )
          }

          const { bookings: series, groupId } = group
          const pendingInSeries = series.filter(b => b.status === 'pending_token').length
          return (
            <div key={groupId} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', marginBottom: '1.25rem', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ background: 'linear-gradient(90deg,#1f0a0a,var(--bg2))', borderBottom: '1px solid var(--border)', padding: '0.7rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.85rem' }}>🔁</span>
                  <span style={{ color: 'var(--red)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700 }}>Weekly · {formatHour(series[0].slots.start_hour)}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {pendingInSeries > 0 && <span className="badge badge-pending">{pendingInSeries} pending</span>}
                  <span style={{ color: 'var(--text3)', fontSize: '0.8rem' }}>{series.length} lessons</span>
                </div>
              </div>
              {series.map((b, i) => {
                const within24 = isWithin24Hours(b.slots.slot_date, b.slots.start_hour)
                const isPending = b.status === 'pending_token'
                return (
                  <div key={b.id} style={{ background: isPending ? 'linear-gradient(90deg,#1a1600,var(--bg2))' : (i % 2 === 0 ? 'var(--bg2)' : 'var(--bg)'), padding: '0.7rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: i < series.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span style={{ color: 'var(--text)', fontWeight: 600, fontSize: '0.92rem' }}>{b.slots.slot_date}</span>
                      <span style={{ color: 'var(--text3)', fontSize: '0.82rem' }}>{formatHour(b.slots.start_hour)}</span>
                      {isPending && <span className="badge badge-pending">Awaiting Token</span>}
                      {!isPending && within24 && <span style={{ color: '#f97316', fontSize: '0.72rem' }}>⚠️ no refund</span>}
                    </div>
                    <button onClick={() => handleCancelClick(b)} disabled={isProcessing} style={{ padding: '0.3rem 0.7rem', background: 'transparent', color: 'var(--red)', border: '1px solid var(--red)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: '0.78rem' }}>Cancel</button>
                  </div>
                )
              })}
            </div>
          )
        })}
      )}

      <a href="/book" style={{ display: 'block', marginTop: '1.5rem', padding: '0.9rem', background: 'var(--red)', color: '#fff', textDecoration: 'none', borderRadius: 'var(--radius-sm)', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', fontSize: '0.95rem', textAlign: 'center', boxShadow: '0 2px 12px var(--red-glow)' }}>
        + Book a Lesson
      </a>
    </main>
  )
}
