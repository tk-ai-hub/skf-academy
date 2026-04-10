'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

function formatHour(h) {
  if (h < 12) return `${h}:00 AM`
  if (h === 12) return `12:00 PM`
  return `${h - 12}:00 PM`
}

export default function Dashboard() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [bookings, setBookings] = useState([])
  const [balance, setBalance] = useState(0)
  const [cancelPrompt, setCancelPrompt] = useState(null) // { booking, isRecurring }

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/login'; return }
      setUser(user)

      const { data: profileData } = await supabase
        .from('users')
        .select('first_name, last_name, phone, belt_rank')
        .eq('id', user.id)
        .single()
      setProfile(profileData)

      const { data: bookingData } = await supabase
        .from('bookings')
        .select(`
          id, status, booked_at, tenant_id, student_id, is_recurring, recurring_group_id,
          slots!bookings_slot_id_fkey ( id, slot_date, start_hour )
        `)
        .eq('student_id', user.id)
        .eq('status', 'confirmed')
        .order('booked_at', { ascending: true })
      setBookings((bookingData || []).filter(b => b.slots))

      const { data: tokenData } = await supabase
        .from('tokens')
        .select('amount')
        .eq('student_id', user.id)
      const total = (tokenData || []).reduce((sum, t) => sum + t.amount, 0)
      setBalance(total)
    }
    load()
  }, [])

  function handleCancelClick(booking) {
    if (booking.slots.slot_date < new Date().toISOString().split("T")[0]) { alert("Cannot cancel a past lesson."); return }
    if (booking.slots.slot_date < new Date().toISOString().split("T")[0]) { alert("Cannot cancel a past lesson."); return }
    if (booking.is_recurring && booking.recurring_group_id) {
      // Check if there are other bookings in the same recurring group
      const seriesBookings = bookings.filter(
        b => b.recurring_group_id === booking.recurring_group_id && b.id !== booking.id
      )
      if (seriesBookings.length > 0) {
        setCancelPrompt({ booking, hasSeries: true, seriesCount: seriesBookings.length + 1 })
        return
      }
    }
    // Single or last in series — just cancel directly
    doCancel(booking, false)
  }

  async function doCancel(booking, cancelSeries) {
    setCancelPrompt(null)
    const studentName = profile?.first_name
      ? `${profile.last_name || ''} ${profile.first_name}`.trim()
      : user.email

    if (cancelSeries && booking.recurring_group_id) {
      // Cancel all future bookings in this recurring group
      const seriesBookings = bookings.filter(
        b => b.recurring_group_id === booking.recurring_group_id
      )
      for (const b of seriesBookings) {
        await supabase.from('bookings')
          .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
          .eq('id', b.id)
        await supabase.from('tokens').insert({
          tenant_id: b.tenant_id,
          student_id: b.student_id,
          amount: 1,
          reason: 'recurring series cancelled - refund',
          booking_id: b.id
        })
        await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'cancellation',
            studentEmail: user.email,
            studentName,
            phone: profile?.phone || '',
            date: b.slots.slot_date,
            time: formatHour(b.slots.start_hour),
            hour: b.slots.start_hour
          })
        })
      }
      const refundAmount = seriesBookings.length
      setBookings(prev => prev.filter(b => b.recurring_group_id !== booking.recurring_group_id))
      setBalance(prev => prev + refundAmount)
    } else {
      // Cancel single occurrence
      await supabase.from('bookings')
        .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
        .eq('id', booking.id)
      await supabase.from('tokens').insert({
        tenant_id: booking.tenant_id,
        student_id: booking.student_id,
        amount: 1,
        reason: 'lesson cancelled - refund',
        booking_id: booking.id
      })
      await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'cancellation',
          studentEmail: user.email,
          studentName,
          phone: profile?.phone || '',
          date: booking.slots.slot_date,
          time: formatHour(booking.slots.start_hour),
          hour: booking.slots.start_hour
        })
      })
      setBookings(prev => prev.filter(b => b.id !== booking.id))
      setBalance(prev => prev + 1)
    }
  }

  // Group bookings: show recurring series grouped with a header
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
  const displayName = profile?.first_name
    ? `${profile.first_name} ${profile.last_name || ''}`.trim()
    : user?.email

  return (
    <main>
      {/* Welcome */}
      {user && (
        <div style={{ marginBottom: '1.5rem' }}>
          <p style={{ color: '#999', margin: 0 }}>Welcome back,</p>
          <h2 style={{ color: '#fff', margin: '0.25rem 0 0', fontSize: '1.5rem' }}>{displayName}</h2>
          {profile?.belt_rank && (
            <p style={{ color: '#cc0000', fontSize: '0.8rem', letterSpacing: '2px', textTransform: 'uppercase', margin: '0.25rem 0 0' }}>
              {profile.belt_rank} belt
            </p>
          )}
        </div>
      )}

      {/* Token Balance */}
      <div style={{ background: '#2a2a2a', border: '1px solid #cc0000', padding: '1rem 1.5rem', borderRadius: '8px', marginBottom: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ color: '#cc0000', fontSize: '0.75rem', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Lesson Tokens</div>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#fff' }}>{balance}</div>
        </div>
        <div style={{ color: '#666', fontSize: '0.85rem', textAlign: 'right' }}>
          Renew monthly<br />
          <span style={{ color: '#cc0000' }}>4 tokens/month</span>
        </div>
      </div>

      {/* Cancel Prompt Modal */}
      {cancelPrompt && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem'
        }}>
          <div style={{ background: '#1a1a1a', border: '1px solid #cc0000', borderRadius: '12px', padding: '1.75rem', maxWidth: '380px', width: '100%' }}>
            <h3 style={{ color: '#fff', margin: '0 0 0.5rem', fontSize: '1.1rem' }}>Cancel Booking</h3>
            <p style={{ color: '#999', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
              This is part of a recurring series ({cancelPrompt.seriesCount} lessons). What would you like to cancel?
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <button
                onClick={() => doCancel(cancelPrompt.booking, false)}
                style={{ padding: '0.75rem', background: '#2a2a2a', color: '#fff', border: '1px solid #444', borderRadius: '8px', cursor: 'pointer', textAlign: 'left' }}
              >
                <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>This lesson only</div>
                <div style={{ color: '#666', fontSize: '0.8rem' }}>
                  Cancel {cancelPrompt.booking.slots.slot_date} at {formatHour(cancelPrompt.booking.slots.start_hour)} — refund 1 token
                </div>
              </button>
              <button
                onClick={() => doCancel(cancelPrompt.booking, true)}
                style={{ padding: '0.75rem', background: '#2a0000', color: '#fff', border: '1px solid #cc0000', borderRadius: '8px', cursor: 'pointer', textAlign: 'left' }}
              >
                <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>All {cancelPrompt.seriesCount} lessons in this series</div>
                <div style={{ color: '#cc6666', fontSize: '0.8rem' }}>
                  Cancels the entire recurring schedule — refund {cancelPrompt.seriesCount} tokens
                </div>
              </button>
              <button
                onClick={() => setCancelPrompt(null)}
                style={{ padding: '0.6rem', background: 'transparent', color: '#666', border: '1px solid #333', borderRadius: '8px', cursor: 'pointer' }}
              >
                Keep my booking
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upcoming Lessons */}
      <h2 style={{ color: '#fff', borderBottom: '1px solid #333', paddingBottom: '0.5rem', marginBottom: '1.5rem' }}>
        Upcoming Lessons
      </h2>

      {grouped.length === 0 ? (
        <p style={{ color: '#666' }}>No upcoming lessons booked.</p>
      ) : (
        grouped.map((group, gi) => {
          if (group.type === 'single') {
            const b = group.booking
            return (
              <div key={b.id} style={{ background: '#2a2a2a', border: '1px solid #333', borderRadius: '8px', padding: '1rem 1.5rem', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ margin: 0, fontWeight: 'bold', fontSize: '1.1rem', color: '#fff' }}>
                    {b.slots.slot_date} at {formatHour(b.slots.start_hour)}
                  </p>
                  <p style={{ margin: '0.25rem 0 0', color: '#666', fontSize: '0.85rem' }}>Private Lesson</p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <a href="/book" style={{ padding: '0.4rem 1rem', background: '#cc0000', color: '#fff', textDecoration: 'none', borderRadius: '4px', fontSize: '0.9rem' }}>Reschedule</a>
                  <button onClick={() => handleCancelClick(b)} style={{ padding: '0.4rem 1rem', background: 'transparent', color: '#cc0000', border: '1px solid #cc0000', borderRadius: '4px', cursor: 'pointer', fontSize: '0.9rem' }}>Cancel</button>
                </div>
              </div>
            )
          }

          // Recurring series group
          const { bookings: series, groupId } = group
          return (
            <div key={groupId} style={{ border: '1px solid #444', borderRadius: '10px', marginBottom: '1.25rem', overflow: 'hidden' }}>
              <div style={{ background: '#2a1a1a', borderBottom: '1px solid #333', padding: '0.6rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ color: '#cc0000', fontSize: '0.8rem' }}>🔁</span>
                  <span style={{ color: '#cc0000', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 'bold' }}>
                    Weekly Recurring — {formatHour(series[0].slots.start_hour)}
                  </span>
                </div>
                <span style={{ color: '#666', fontSize: '0.8rem' }}>{series.length} lessons</span>
              </div>
              {series.map((b, i) => (
                <div key={b.id} style={{
                  background: i % 2 === 0 ? '#222' : '#1e1e1e',
                  padding: '0.75rem 1.25rem',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  borderBottom: i < series.length - 1 ? '1px solid #2a2a2a' : 'none'
                }}>
                  <div>
                    <span style={{ color: '#fff', fontWeight: 'bold', fontSize: '0.95rem' }}>{b.slots.slot_date}</span>
                    <span style={{ color: '#666', fontSize: '0.85rem', marginLeft: '0.5rem' }}>at {formatHour(b.slots.start_hour)}</span>
                  </div>
                  <button
                    onClick={() => handleCancelClick(b)}
                    style={{ padding: '0.3rem 0.75rem', background: 'transparent', color: '#cc0000', border: '1px solid #cc0000', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
                  >Cancel</button>
                </div>
              ))}
            </div>
          )
        })
      )}

      <a href="/book" style={{ display: 'inline-block', marginTop: '1.5rem', padding: '0.75rem 2rem', background: '#cc0000', color: '#fff', textDecoration: 'none', borderRadius: '6px', fontWeight: 'bold', letterSpacing: '1px', textTransform: 'uppercase', fontSize: '0.9rem' }}>
        + Book a Lesson
      </a>
    </main>
  )
}
