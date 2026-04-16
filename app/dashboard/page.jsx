'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

function formatHour(h) {
  if (h < 12) return `${h}:00 AM`
  if (h === 12) return `12:00 PM`
  return `${h - 12}:00 PM`
}

function formatDate(d) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-CA', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })
}

export default function Dashboard() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [bookings, setBookings] = useState([])
  const [balance, setBalance] = useState(0)
  const [cancelPrompt, setCancelPrompt] = useState(null)
  const [activeTab, setActiveTab] = useState('upcoming')
  const [notifSaving, setNotifSaving] = useState(false)
  const [notifSaved, setNotifSaved] = useState(false)
  const [pushEnabled, setPushEnabled] = useState(false)
  const [pushLoading, setPushLoading] = useState(false)

  const today = new Date().toISOString().split('T')[0]

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/login'; return }
      setUser(user)

      const { data: profileData } = await supabase
        .from('users')
        .select('first_name, last_name, phone, belt_rank, notify_2h, notify_12h, notify_24h, notify_48h')
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

      // Check if push is already subscribed on this device
      if ('serviceWorker' in navigator && 'PushManager' in window) {
        const reg = await navigator.serviceWorker.ready
        const existing = await reg.pushManager.getSubscription()
        setPushEnabled(!!existing)
      }
    }
    load()
  }, [])

  const upcomingBookings = bookings.filter(b => b.slots.slot_date >= today)
  const pastBookings = bookings.filter(b => b.slots.slot_date < today)
    .sort((a, b) => b.slots.slot_date.localeCompare(a.slots.slot_date) || b.slots.start_hour - a.slots.start_hour)

  function handleCancelClick(booking) {
    if (booking.slots.slot_date < today) return // past — no cancel
    if (booking.is_recurring && booking.recurring_group_id) {
      const seriesBookings = upcomingBookings.filter(
        b => b.recurring_group_id === booking.recurring_group_id && b.id !== booking.id
      )
      if (seriesBookings.length > 0) {
        setCancelPrompt({ booking, hasSeries: true, seriesCount: seriesBookings.length + 1 })
        return
      }
    }
    doCancel(booking, false)
  }

  async function doCancel(booking, cancelSeries) {
    setCancelPrompt(null)
    const studentName = profile?.first_name
      ? `${profile.last_name || ''} ${profile.first_name}`.trim()
      : user.email

    if (cancelSeries && booking.recurring_group_id) {
      // Only cancel future bookings — never past ones
      const futureInSeries = upcomingBookings.filter(
        b => b.recurring_group_id === booking.recurring_group_id
      )
      for (const b of futureInSeries) {
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
      setBookings(prev => prev.filter(b =>
        !(b.recurring_group_id === booking.recurring_group_id && b.slots.slot_date >= today)
      ))
      setBalance(prev => prev + futureInSeries.length)
    } else {
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

  function groupBookings(list) {
    const seen = new Set()
    const result = []
    for (const b of list) {
      if (b.is_recurring && b.recurring_group_id) {
        if (!seen.has(b.recurring_group_id)) {
          seen.add(b.recurring_group_id)
          const series = list.filter(x => x.recurring_group_id === b.recurring_group_id)
          result.push({ type: 'series', groupId: b.recurring_group_id, bookings: series })
        }
      } else {
        result.push({ type: 'single', booking: b })
      }
    }
    return result
  }

  const upcomingGrouped = groupBookings(upcomingBookings)
  const pastGrouped = groupBookings(pastBookings)

  const displayName = profile?.first_name
    ? `${profile.first_name} ${profile.last_name || ''}`.trim()
    : user?.email

  async function togglePush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    setPushLoading(true)
    try {
      const reg = await navigator.serviceWorker.ready
      if (pushEnabled) {
        const sub = await reg.pushManager.getSubscription()
        if (sub) await sub.unsubscribe()
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id, endpoint: sub?.endpoint }),
        })
        setPushEnabled(false)
      } else {
        const permission = await Notification.requestPermission()
        if (permission !== 'granted') { setPushLoading(false); return }
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
        })
        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id, subscription: sub.toJSON() }),
        })
        setPushEnabled(true)
      }
    } catch (e) {
      console.error('Push toggle failed', e)
    }
    setPushLoading(false)
  }

  async function saveNotifPref(key, value) {
    setNotifSaving(true)
    setNotifSaved(false)
    setProfile(prev => ({ ...prev, [key]: value }))
    await supabase.from('users').update({ [key]: value }).eq('id', user.id)
    setNotifSaving(false)
    setNotifSaved(true)
    setTimeout(() => setNotifSaved(false), 2000)
  }

  const tabStyle = (tab) => ({
    padding: '0.5rem 1.25rem',
    background: activeTab === tab ? '#cc0000' : 'transparent',
    color: activeTab === tab ? '#fff' : '#666',
    border: activeTab === tab ? '1px solid #cc0000' : '1px solid #333',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '0.85rem',
    fontWeight: activeTab === tab ? 'bold' : 'normal',
  })

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
                <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>All remaining lessons in this series</div>
                <div style={{ color: '#cc6666', fontSize: '0.8rem' }}>
                  Cancels all future scheduled lessons — refund {cancelPrompt.seriesCount} tokens
                </div>
              </button>
              <button
                onClick={() => setCancelPrompt(null)}
                style={{ padding: '0.6rem', background: 'transparent', color: '#666', border: '1px solid #333', borderRadius: '8px', cursor: 'pointer' }}
              >Keep my booking</button>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <button style={tabStyle('upcoming')} onClick={() => setActiveTab('upcoming')}>
          Upcoming {upcomingBookings.length > 0 && <span style={{ background: '#cc0000', color: '#fff', borderRadius: '10px', padding: '1px 6px', fontSize: '0.75rem', marginLeft: '4px' }}>{upcomingBookings.length}</span>}
        </button>
        <button style={tabStyle('history')} onClick={() => setActiveTab('history')}>
          History {pastBookings.length > 0 && <span style={{ background: '#444', color: '#ccc', borderRadius: '10px', padding: '1px 6px', fontSize: '0.75rem', marginLeft: '4px' }}>{pastBookings.length}</span>}
        </button>
        <button style={tabStyle('notifications')} onClick={() => setActiveTab('notifications')}>
          Notifications
        </button>
      </div>

      {/* ── UPCOMING TAB ── */}
      {activeTab === 'upcoming' && (
        <>
          {upcomingGrouped.length === 0 ? (
            <p style={{ color: '#666' }}>No upcoming lessons booked.</p>
          ) : (
            upcomingGrouped.map((group) => {
              if (group.type === 'single') {
                const b = group.booking
                return (
                  <div key={b.id} style={{ background: '#2a2a2a', border: '1px solid #333', borderRadius: '8px', padding: '1rem 1.5rem', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <p style={{ margin: 0, fontWeight: 'bold', fontSize: '1.05rem', color: '#fff' }}>
                        {formatDate(b.slots.slot_date)}
                      </p>
                      <p style={{ margin: '0.2rem 0 0', color: '#cc0000', fontSize: '0.85rem' }}>{formatHour(b.slots.start_hour)} · Private Lesson</p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                      <a href="/book" style={{ padding: '0.4rem 1rem', background: '#cc0000', color: '#fff', textDecoration: 'none', borderRadius: '4px', fontSize: '0.85rem' }}>Reschedule</a>
                      <button onClick={() => handleCancelClick(b)} style={{ padding: '0.4rem 1rem', background: 'transparent', color: '#cc0000', border: '1px solid #cc0000', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' }}>Cancel</button>
                    </div>
                  </div>
                )
              }

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
                        <span style={{ color: '#fff', fontWeight: 'bold', fontSize: '0.95rem' }}>{formatDate(b.slots.slot_date)}</span>
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

          <a href="/book" style={{ display: 'inline-block', marginTop: '1rem', padding: '0.75rem 2rem', background: '#cc0000', color: '#fff', textDecoration: 'none', borderRadius: '6px', fontWeight: 'bold', letterSpacing: '1px', textTransform: 'uppercase', fontSize: '0.9rem' }}>
            + Book a Lesson
          </a>
        </>
      )}

      {/* ── HISTORY TAB ── */}
      {activeTab === 'history' && (
        <>
          {pastGrouped.length === 0 ? (
            <p style={{ color: '#666' }}>No past lessons yet.</p>
          ) : (
            pastGrouped.map((group) => {
              if (group.type === 'single') {
                const b = group.booking
                return (
                  <div key={b.id} style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '8px', padding: '1rem 1.5rem', marginBottom: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: 0.75 }}>
                    <div>
                      <p style={{ margin: 0, fontWeight: 'bold', fontSize: '1rem', color: '#aaa' }}>
                        {formatDate(b.slots.slot_date)}
                      </p>
                      <p style={{ margin: '0.2rem 0 0', color: '#555', fontSize: '0.85rem' }}>{formatHour(b.slots.start_hour)} · Private Lesson</p>
                    </div>
                    <span style={{ color: '#444', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Completed</span>
                  </div>
                )
              }

              const { bookings: series, groupId } = group
              return (
                <div key={groupId} style={{ border: '1px solid #2a2a2a', borderRadius: '10px', marginBottom: '1.25rem', overflow: 'hidden', opacity: 0.75 }}>
                  <div style={{ background: '#1a1a1a', borderBottom: '1px solid #2a2a2a', padding: '0.6rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ color: '#555', fontSize: '0.8rem' }}>🔁</span>
                      <span style={{ color: '#555', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
                        Weekly Recurring — {formatHour(series[0].slots.start_hour)}
                      </span>
                    </div>
                    <span style={{ color: '#444', fontSize: '0.8rem' }}>{series.length} lessons</span>
                  </div>
                  {series.map((b, i) => (
                    <div key={b.id} style={{
                      background: i % 2 === 0 ? '#161616' : '#131313',
                      padding: '0.65rem 1.25rem',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      borderBottom: i < series.length - 1 ? '1px solid #1f1f1f' : 'none'
                    }}>
                      <span style={{ color: '#777', fontSize: '0.9rem' }}>{formatDate(b.slots.slot_date)} · {formatHour(b.slots.start_hour)}</span>
                      <span style={{ color: '#444', fontSize: '0.75rem', textTransform: 'uppercase' }}>Completed</span>
                    </div>
                  ))}
                </div>
              )
            })
          )}
        </>
      )}
      {/* ── NOTIFICATIONS TAB ── */}
      {activeTab === 'notifications' && (
        <div style={{ maxWidth: '480px' }}>
          <p style={{ color: '#999', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            Choose how and when to receive reminders before your upcoming lessons.
          </p>

          {/* Push notifications */}
          {'Notification' in window && (
            <div style={{
              background: '#1a1a1a',
              border: `1px solid ${pushEnabled ? '#cc0000' : '#2a2a2a'}`,
              borderRadius: '8px',
              padding: '1rem 1.25rem',
              marginBottom: '1.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <div>
                <div style={{ color: '#fff', fontWeight: 'bold', fontSize: '0.95rem' }}>Push notifications</div>
                <div style={{ color: '#555', fontSize: '0.8rem', marginTop: '2px' }}>
                  {pushEnabled ? 'Enabled on this device' : 'Get alerts on this device even when the app is closed'}
                </div>
              </div>
              <button
                onClick={togglePush}
                disabled={pushLoading}
                style={{
                  width: '48px', height: '26px', borderRadius: '13px', border: 'none',
                  cursor: pushLoading ? 'default' : 'pointer',
                  background: pushEnabled ? '#cc0000' : '#333',
                  position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                }}
              >
                <span style={{
                  position: 'absolute', top: '3px',
                  left: pushEnabled ? '25px' : '3px',
                  width: '20px', height: '20px', borderRadius: '50%',
                  background: '#fff', transition: 'left 0.2s',
                }} />
              </button>
            </div>
          )}

          <div style={{ color: '#555', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.75rem' }}>Email reminders</div>

          {[
            { key: 'notify_48h', label: '48 hours before' },
            { key: 'notify_24h', label: '24 hours before' },
            { key: 'notify_12h', label: '12 hours before' },
            { key: 'notify_2h',  label: '2 hours before' },
          ].map(({ key, label }) => {
            const enabled = profile?.[key] !== false // default true if null/undefined
            return (
              <div key={key} style={{
                background: '#1a1a1a',
                border: '1px solid #2a2a2a',
                borderRadius: '8px',
                padding: '1rem 1.25rem',
                marginBottom: '0.75rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <div>
                  <div style={{ color: '#fff', fontWeight: 'bold', fontSize: '0.95rem' }}>{label}</div>
                  <div style={{ color: '#555', fontSize: '0.8rem', marginTop: '2px' }}>Email reminder</div>
                </div>
                <button
                  onClick={() => saveNotifPref(key, !enabled)}
                  disabled={notifSaving}
                  style={{
                    width: '48px',
                    height: '26px',
                    borderRadius: '13px',
                    border: 'none',
                    cursor: notifSaving ? 'default' : 'pointer',
                    background: enabled ? '#cc0000' : '#333',
                    position: 'relative',
                    transition: 'background 0.2s',
                    flexShrink: 0,
                  }}
                >
                  <span style={{
                    position: 'absolute',
                    top: '3px',
                    left: enabled ? '25px' : '3px',
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    background: '#fff',
                    transition: 'left 0.2s',
                  }} />
                </button>
              </div>
            )
          })}

          {notifSaved && (
            <p style={{ color: '#4caf50', fontSize: '0.85rem', marginTop: '0.5rem' }}>Saved</p>
          )}
        </div>
      )}
    </main>
  )
}
