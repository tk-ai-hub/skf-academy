'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatHour(h) {
  if (h < 12) return `${h}:00 AM`
  if (h === 12) return `12:00 PM`
  return `${h - 12}:00 PM`
}
function formatDate(d) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-CA', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })
}
function getEmbedUrl(url) {
  const yt = url?.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?/]+)/)
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`
  const vi = url?.match(/vimeo\.com\/(\d+)/)
  if (vi) return `https://player.vimeo.com/video/${vi[1]}`
  return null
}

// ── Mini Calendar ─────────────────────────────────────────────────────────────
function MiniCalendar({ bookings }) {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const todayNum = now.getDate()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  let firstDow = new Date(year, month, 1).getDay()
  firstDow = firstDow === 0 ? 6 : firstDow - 1 // Mon = 0

  const lessonDays = new Set(
    (bookings || [])
      .filter(b => {
        if (!b.slots?.slot_date) return false
        const [y, m] = b.slots.slot_date.split('-').map(Number)
        return y === year && m === month + 1 && b.slots.slot_date >= new Date().toISOString().split('T')[0]
      })
      .map(b => parseInt(b.slots.slot_date.split('-')[2]))
  )

  const cells = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  return (
    <div>
      <div style={{ color: '#fff', fontSize: '13px', fontWeight: 'bold', textAlign: 'center', marginBottom: '10px' }}>
        {now.toLocaleDateString('en-CA', { month: 'long', year: 'numeric' })}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1px', textAlign: 'center' }}>
        {['M','T','W','T','F','S','S'].map((d, i) => (
          <div key={i} style={{ color: '#333', fontSize: '11px', paddingBottom: '6px' }}>{d}</div>
        ))}
        {cells.map((day, i) => {
          if (!day) return <div key={i} />
          const isToday = day === todayNum
          const isPast = day < todayNum
          const hasLesson = lessonDays.has(day)
          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', padding: '1px 0' }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: '22px', height: '22px', borderRadius: '50%',
                background: isToday ? '#cc0000' : 'transparent',
                color: isToday ? '#fff' : isPast ? '#2a2a2a' : '#888',
                fontSize: '11px', fontWeight: isToday ? 'bold' : 'normal',
              }}>{day}</span>
              {hasLesson && (
                <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: isToday ? '#ff6666' : '#cc0000' }} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
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
  const [awayModal, setAwayModal] = useState(false)
  const [awayUntilInput, setAwayUntilInput] = useState('')
  const [awayLoading, setAwayLoading] = useState(false)
  const [awayMode, setAwayMode] = useState(false)
  const [awayUntil, setAwayUntil] = useState(null)
  const [showWhatsNew, setShowWhatsNew] = useState(false)
  const [poll, setPoll] = useState(null)
  const [pollVotes, setPollVotes] = useState({})
  const [pollTotal, setPollTotal] = useState(0)
  const [myVote, setMyVote] = useState(null)
  const [pollVoting, setPollVoting] = useState(false)
  const [libraryItems, setLibraryItems] = useState([])
  const [libraryLoading, setLibraryLoading] = useState(false)
  const [libraryFilter, setLibraryFilter] = useState('all')
  const [activeLibraryVideo, setActiveLibraryVideo] = useState(null)

  const today = new Date().toISOString().split('T')[0]

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/login'; return }
      setUser(user)

      const { data: profileData } = await supabase
        .from('users')
        .select('first_name, last_name, phone, belt_rank, notify_2h, notify_12h, notify_24h, notify_48h, away_mode, away_until')
        .eq('id', user.id).single()
      setProfile(profileData)
      setAwayMode(profileData?.away_mode || false)
      setAwayUntil(profileData?.away_until || null)
      if (!localStorage.getItem('skf_whats_new_v2')) setShowWhatsNew(true)

      const { data: bookingData } = await supabase
        .from('bookings')
        .select(`id, status, booked_at, tenant_id, student_id, is_recurring, recurring_group_id,
          slots!bookings_slot_id_fkey ( id, slot_date, start_hour )`)
        .eq('student_id', user.id).eq('status', 'confirmed')
        .order('booked_at', { ascending: true })
      setBookings((bookingData || []).filter(b => b.slots))

      const { data: tokenData } = await supabase.from('tokens').select('amount').eq('student_id', user.id)
      setBalance((tokenData || []).reduce((sum, t) => sum + t.amount, 0))

      try {
        const pollRes = await fetch(`/api/polls?userId=${user.id}`)
        const pollData = await pollRes.json()
        if (pollData.poll) {
          setPoll(pollData.poll); setPollVotes(pollData.votes || {})
          setPollTotal(pollData.total || 0); setMyVote(pollData.myVote || null)
        }
      } catch { /* polls table may not exist yet */ }

      if ('serviceWorker' in navigator && 'PushManager' in window) {
        const reg = await navigator.serviceWorker.ready
        const existing = await reg.pushManager.getSubscription()
        setPushEnabled(!!existing)
      }
    }
    load()
  }, [])

  useEffect(() => {
    if (activeTab === 'library' && libraryItems.length === 0 && !libraryLoading) {
      loadLibrary()
    }
  }, [activeTab])

  async function loadLibrary() {
    setLibraryLoading(true)
    const res = await fetch('/api/library')
    const data = await res.json()
    setLibraryItems(Array.isArray(data) ? data : [])
    setLibraryLoading(false)
  }

  const upcomingBookings = bookings.filter(b => b.slots.slot_date >= today)
  const pastBookings = bookings.filter(b => b.slots.slot_date < today)
    .sort((a, b) => b.slots.slot_date.localeCompare(a.slots.slot_date) || b.slots.start_hour - a.slots.start_hour)

  function slotTime(b) {
    return new Date(`${b.slots.slot_date}T${String(b.slots.start_hour).padStart(2,'0')}:00:00`)
  }
  function isWithin24h(b) { return (slotTime(b) - new Date()) < 86400000 }
  function isPast(b) { return slotTime(b) < new Date() }

  function handleCancelClick(b) {
    if (isPast(b)) return
    if (b.is_recurring && b.recurring_group_id) {
      const series = upcomingBookings.filter(x => x.recurring_group_id === b.recurring_group_id && x.id !== b.id)
      if (series.length > 0) {
        setCancelPrompt({ booking: b, hasSeries: true, seriesCount: series.length + 1, within24: isWithin24h(b) }); return
      }
    }
    setCancelPrompt({ booking: b, hasSeries: false, within24: isWithin24h(b) })
  }

  async function doCancel(b, cancelSeries) {
    setCancelPrompt(null)
    const res = await fetch('/api/cancel-booking', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId: b.id, cancelSeries })
    })
    const data = await res.json()
    if (!res.ok) { alert(data.error || 'Cancellation failed'); return }
    setBookings(prev => cancelSeries && b.recurring_group_id
      ? prev.filter(x => !(x.recurring_group_id === b.recurring_group_id && !isPast(x)))
      : prev.filter(x => x.id !== b.id))
    setBalance(prev => prev + (data.refunded || 0))
  }

  function groupBookings(list) {
    const seen = new Set(); const result = []
    for (const b of list) {
      if (b.is_recurring && b.recurring_group_id) {
        if (!seen.has(b.recurring_group_id)) {
          seen.add(b.recurring_group_id)
          result.push({ type: 'series', groupId: b.recurring_group_id, bookings: list.filter(x => x.recurring_group_id === b.recurring_group_id) })
        }
      } else { result.push({ type: 'single', booking: b }) }
    }
    return result
  }

  async function togglePush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    setPushLoading(true)
    try {
      const reg = await navigator.serviceWorker.ready
      if (pushEnabled) {
        const sub = await reg.pushManager.getSubscription()
        if (sub) await sub.unsubscribe()
        await fetch('/api/push/subscribe', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: user.id, endpoint: sub?.endpoint }) })
        setPushEnabled(false)
      } else {
        const permission = await Notification.requestPermission()
        if (permission !== 'granted') { setPushLoading(false); return }
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY })
        await fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: user.id, subscription: sub.toJSON() }) })
        setPushEnabled(true)
      }
    } catch (e) { console.error('Push toggle failed', e) }
    setPushLoading(false)
  }

  async function saveNotifPref(key, value) {
    setNotifSaving(true); setNotifSaved(false)
    setProfile(prev => ({ ...prev, [key]: value }))
    await supabase.from('users').update({ [key]: value }).eq('id', user.id)
    setNotifSaving(false); setNotifSaved(true)
    setTimeout(() => setNotifSaved(false), 2000)
  }

  async function activateAway() {
    setAwayLoading(true)
    const res = await fetch('/api/set-away', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: user.id, awayUntil: awayUntilInput || null }) })
    const data = await res.json()
    setAwayLoading(false)
    if (res.ok) {
      setAwayMode(true); setAwayUntil(awayUntilInput || null); setAwayModal(false); setAwayUntilInput('')
      if (data.cancelled > 0) { setBookings(prev => prev.filter(b => b.slots.slot_date < today)); setBalance(prev => prev + data.refunded) }
    }
  }

  async function clearAway() {
    setAwayLoading(true)
    await fetch('/api/set-away', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: user.id, clearAway: true }) })
    setAwayLoading(false); setAwayMode(false); setAwayUntil(null)
  }

  async function castVote(optionId) {
    if (!poll || !user || pollVoting || myVote === optionId) return
    setPollVoting(true)
    const prevVote = myVote
    const res = await fetch('/api/polls/vote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pollId: poll.id, optionId, userId: user.id }) })
    if (res.ok) {
      setMyVote(optionId)
      setPollVotes(prev => {
        const updated = { ...prev }
        if (prevVote) updated[prevVote] = Math.max(0, (updated[prevVote] || 0) - 1)
        updated[optionId] = (updated[optionId] || 0) + 1
        return updated
      })
      if (!prevVote) setPollTotal(prev => prev + 1)
    }
    setPollVoting(false)
  }

  const displayName = profile?.first_name ? `${profile.first_name} ${profile.last_name || ''}`.trim() : user?.email
  const upcomingGrouped = groupBookings(upcomingBookings)
  const pastGrouped = groupBookings(pastBookings)

  const libCategories = ['all', ...Array.from(new Set(libraryItems.map(i => i.category).filter(Boolean)))]
  const libFiltered = libraryFilter === 'all' ? libraryItems : libraryItems.filter(i => i.category === libraryFilter)
  const libVideos = libFiltered.filter(i => i.type === 'video')
  const libPdfs = libFiltered.filter(i => i.type === 'pdf')

  // ── Styles ──────────────────────────────────────────────────────────────────
  const tabBtn = (tab) => ({
    padding: '10px 16px', background: 'transparent', border: 'none', cursor: 'pointer',
    fontSize: '13px', fontWeight: activeTab === tab ? 'bold' : 'normal',
    color: activeTab === tab ? '#fff' : '#555',
    borderBottom: activeTab === tab ? '2px solid #cc0000' : '2px solid transparent',
    transition: 'all 0.15s', whiteSpace: 'nowrap',
  })
  const inp = { width: '100%', padding: '10px 16px', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '8px', color: '#fff', fontSize: '13px', boxSizing: 'border-box' }

  return (
    <div>
      {/* ── What's New Banner ──────────────────────────────────────────────── */}
      {showWhatsNew && (
        <div style={{ background: 'linear-gradient(135deg, #0d1a0d 0%, #0a0a14 100%)', border: '1px solid #1a5c1a', borderRadius: '10px', padding: '16px 16px 16px 26px', marginBottom: '26px', position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                <span style={{ background: '#1a8c1a', color: '#fff', fontSize: '11px', fontWeight: 'bold', padding: '2px 8px', borderRadius: '4px', letterSpacing: '1px', textTransform: 'uppercase' }}>What's New</span>
                <span style={{ color: '#4a8c4a', fontSize: '11px' }}>May 2025 Update</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '20px', flexShrink: 0 }}>🌴</span>
                  <div>
                    <div style={{ color: '#fff', fontWeight: 'bold', fontSize: '13px' }}>Away Mode</div>
                    <div style={{ color: '#6a8c6a', fontSize: '11px', marginTop: '2px' }}>Going on vacation or sick? Set Away Mode in Notifications — your lessons will be paused and tokens refunded automatically.</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '20px', flexShrink: 0 }}>📚</span>
                  <div>
                    <div style={{ color: '#fff', fontWeight: 'bold', fontSize: '13px' }}>Library <span style={{ background: '#1a3a6a', color: '#6aaaff', fontSize: '11px', fontWeight: 'bold', padding: '1px 6px', borderRadius: '4px', marginLeft: '6px' }}>Coming Soon</span></div>
                    <div style={{ color: '#6a8c6a', fontSize: '11px', marginTop: '2px' }}>Training videos and PDF tutorials are being uploaded — check the Library tab.</div>
                  </div>
                </div>
              </div>
              <button onClick={() => { localStorage.setItem('skf_whats_new_v2', '1'); setShowWhatsNew(false) }}
                style={{ marginTop: '16px', padding: '6px 16px', background: '#1a5c1a', color: '#aaffaa', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>
                Got it!
              </button>
            </div>
            <button onClick={() => { localStorage.setItem('skf_whats_new_v2', '1'); setShowWhatsNew(false) }}
              style={{ background: 'none', border: 'none', color: '#3a5c3a', fontSize: '20px', cursor: 'pointer', lineHeight: 1, flexShrink: 0, padding: 0 }}>×</button>
          </div>
        </div>
      )}

      {/* ── Away Mode Banner ───────────────────────────────────────────────── */}
      {awayMode && (
        <div style={{ background: '#1a1200', border: '1px solid #886600', borderRadius: '10px', padding: '16px 26px', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
          <div>
            <div style={{ color: '#ffcc00', fontWeight: 'bold', fontSize: '15px' }}>🌴 Away Mode Active</div>
            <div style={{ color: '#aa9933', fontSize: '13px', marginTop: '2px' }}>
              {awayUntil ? `Your lessons are paused until ${new Date(awayUntil + 'T00:00:00').toLocaleDateString('en-CA', { month: 'long', day: 'numeric' })}` : 'Your lessons are paused and notifications are off'}
            </div>
          </div>
          <button onClick={clearAway} disabled={awayLoading}
            style={{ padding: '6px 16px', background: '#886600', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', whiteSpace: 'nowrap' }}>
            {awayLoading ? '...' : "I'm Back"}
          </button>
        </div>
      )}

      {/* ── Poll Card ─────────────────────────────────────────────────────────── */}
      {poll && (
        <div style={{ background: 'linear-gradient(135deg, #0d0d1a 0%, #1a0d0d 100%)', border: '1px solid #cc0000', borderRadius: '10px', padding: '16px 26px', marginBottom: '26px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
            <span style={{ background: '#cc0000', color: '#fff', fontSize: '11px', fontWeight: 'bold', padding: '2px 8px', borderRadius: '4px', letterSpacing: '1px', textTransform: 'uppercase' }}>Poll</span>
            <span style={{ color: '#664444', fontSize: '11px' }}>Let us know!</span>
          </div>
          <div style={{ color: '#fff', fontWeight: 'bold', fontSize: '15px', marginBottom: '16px' }}>{poll.question}</div>
          {myVote ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {(poll.options || []).map(opt => {
                const count = pollVotes[opt.id] || 0
                const pct = pollTotal > 0 ? Math.round((count / pollTotal) * 100) : 0
                const chosen = myVote === opt.id
                return (
                  <div key={opt.id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ color: chosen ? '#fff' : '#888', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {chosen && <span style={{ color: '#cc0000', fontSize: '11px' }}>✓</span>}{opt.label}
                      </span>
                      <span style={{ color: chosen ? '#fff' : '#555', fontSize: '13px', fontWeight: chosen ? 'bold' : 'normal' }}>{pct}%</span>
                    </div>
                    <div style={{ background: '#2a2a2a', borderRadius: '4px', height: '6px', overflow: 'hidden' }}>
                      <div style={{ background: chosen ? '#cc0000' : '#333', width: `${pct}%`, height: '100%', borderRadius: '4px', transition: 'width 0.4s' }} />
                    </div>
                  </div>
                )
              })}
              <div style={{ color: '#444', fontSize: '11px', marginTop: '4px' }}>{pollTotal} response{pollTotal !== 1 ? 's' : ''} · tap to change</div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                {(poll.options || []).map(opt => (
                  <button key={opt.id} onClick={() => castVote(opt.id)} disabled={pollVoting || myVote === opt.id}
                    style={{ padding: '4px 10px', background: myVote === opt.id ? '#cc0000' : '#1a1a1a', color: myVote === opt.id ? '#fff' : '#666', border: `1px solid ${myVote === opt.id ? '#cc0000' : '#2a2a2a'}`, borderRadius: '20px', cursor: myVote === opt.id ? 'default' : 'pointer', fontSize: '11px' }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {(poll.options || []).map(opt => (
                <button key={opt.id} onClick={() => castVote(opt.id)} disabled={pollVoting}
                  style={{ padding: '10px 16px', background: '#111', color: '#fff', border: '1px solid #2a2a2a', borderRadius: '10px', cursor: pollVoting ? 'not-allowed' : 'pointer', fontSize: '13px', textAlign: 'left' }}
                  onMouseEnter={e => { if (!pollVoting) e.currentTarget.style.borderColor = '#cc0000' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#2a2a2a' }}>
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Two-Column Layout ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '26px', alignItems: 'flex-start', flexWrap: 'wrap' }}>

        {/* ── MAIN COLUMN (61.8%) ──────────────────────────────────────────────── */}
        <div style={{ flex: '1 1 420px', minWidth: 0 }}>

          {/* Welcome */}
          <div style={{ marginBottom: '26px' }}>
            <div style={{ color: '#444', fontSize: '13px', marginBottom: '4px' }}>Welcome back,</div>
            <div style={{ color: '#fff', fontSize: '24px', fontWeight: 'bold' }}>{displayName}</div>
            {profile?.belt_rank && (
              <div style={{ color: '#cc0000', fontSize: '11px', letterSpacing: '3px', textTransform: 'uppercase', marginTop: '4px' }}>{profile.belt_rank} belt</div>
            )}
          </div>

          {/* Tabs */}
          <div style={{ borderBottom: '1px solid #1a1a1a', marginBottom: '26px', display: 'flex', gap: '0', overflowX: 'auto' }}>
            {[['upcoming', 'Upcoming'], ['history', 'History'], ['library', 'Library'], ['notifications', 'Notifications']].map(([tab, label]) => (
              <button key={tab} style={tabBtn(tab)} onClick={() => setActiveTab(tab)}>{label}</button>
            ))}
          </div>

          {/* ── UPCOMING TAB ── */}
          {activeTab === 'upcoming' && (
            <div>
              {upcomingGrouped.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '42px 16px', color: '#333' }}>
                  <div style={{ fontSize: '38px', marginBottom: '16px' }}>📅</div>
                  <div style={{ fontSize: '13px' }}>No upcoming lessons booked.</div>
                  <a href="/book" style={{ display: 'inline-block', marginTop: '26px', padding: '10px 26px', background: '#cc0000', color: '#fff', textDecoration: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '13px' }}>Book a Lesson</a>
                </div>
              ) : (
                upcomingGrouped.map((group) => {
                  if (group.type === 'single') {
                    const b = group.booking
                    return (
                      <div key={b.id} style={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: '10px', padding: '16px 26px', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
                        <div>
                          <div style={{ fontWeight: 'bold', fontSize: '13px', color: '#fff' }}>{formatDate(b.slots.slot_date)}</div>
                          <div style={{ color: '#cc0000', fontSize: '11px', marginTop: '4px', letterSpacing: '0.5px' }}>{formatHour(b.slots.start_hour)} · Private Lesson</div>
                        </div>
                        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                          {!isWithin24h(b) && <a href="/book" style={{ padding: '6px 13px', background: '#cc0000', color: '#fff', textDecoration: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold' }}>Reschedule</a>}
                          <button onClick={() => handleCancelClick(b)} style={{ padding: '6px 13px', background: 'transparent', color: '#cc0000', border: '1px solid #cc0000', borderRadius: '6px', cursor: 'pointer', fontSize: '11px' }}>Cancel</button>
                        </div>
                      </div>
                    )
                  }
                  const { bookings: series, groupId } = group
                  return (
                    <div key={groupId} style={{ border: '1px solid #2a1a1a', borderRadius: '10px', marginBottom: '16px', overflow: 'hidden' }}>
                      <div style={{ background: '#1a0d0d', borderBottom: '1px solid #2a1a1a', padding: '10px 26px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ color: '#cc0000', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 'bold' }}>🔁 Weekly — {formatHour(series[0].slots.start_hour)}</span>
                        <span style={{ color: '#444', fontSize: '11px' }}>{series.length} lessons</span>
                      </div>
                      {series.map((b, i) => (
                        <div key={b.id} style={{ background: i % 2 === 0 ? '#111' : '#0f0f0f', padding: '10px 26px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: i < series.length - 1 ? '1px solid #1a1a1a' : 'none' }}>
                          <div>
                            <span style={{ color: '#fff', fontWeight: 'bold', fontSize: '13px' }}>{formatDate(b.slots.slot_date)}</span>
                            <span style={{ color: '#444', fontSize: '11px', marginLeft: '10px' }}>{formatHour(b.slots.start_hour)}</span>
                          </div>
                          <button onClick={() => handleCancelClick(b)} style={{ padding: '4px 10px', background: 'transparent', color: '#cc0000', border: '1px solid #cc0000', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>Cancel</button>
                        </div>
                      ))}
                    </div>
                  )
                })
              )}
            </div>
          )}

          {/* ── HISTORY TAB ── */}
          {activeTab === 'history' && (
            <div>
              {pastGrouped.length === 0 ? (
                <p style={{ color: '#333', fontSize: '13px' }}>No past lessons yet.</p>
              ) : (
                pastGrouped.map((group) => {
                  if (group.type === 'single') {
                    const b = group.booking
                    return (
                      <div key={b.id} style={{ background: '#0d0d0d', border: '1px solid #1a1a1a', borderRadius: '10px', padding: '13px 26px', marginBottom: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: 0.6 }}>
                        <div>
                          <div style={{ fontWeight: 'bold', fontSize: '13px', color: '#888' }}>{formatDate(b.slots.slot_date)}</div>
                          <div style={{ color: '#444', fontSize: '11px', marginTop: '2px' }}>{formatHour(b.slots.start_hour)} · Private Lesson</div>
                        </div>
                        <span style={{ color: '#333', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Completed</span>
                      </div>
                    )
                  }
                  const { bookings: series, groupId } = group
                  return (
                    <div key={groupId} style={{ border: '1px solid #1a1a1a', borderRadius: '10px', marginBottom: '16px', overflow: 'hidden', opacity: 0.6 }}>
                      <div style={{ background: '#0d0d0d', borderBottom: '1px solid #1a1a1a', padding: '10px 26px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ color: '#333', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px' }}>🔁 Weekly — {formatHour(series[0].slots.start_hour)}</span>
                        <span style={{ color: '#222', fontSize: '11px' }}>{series.length} lessons</span>
                      </div>
                      {series.map((b, i) => (
                        <div key={b.id} style={{ background: '#0d0d0d', padding: '10px 26px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: i < series.length - 1 ? '1px solid #161616' : 'none' }}>
                          <span style={{ color: '#555', fontSize: '13px' }}>{formatDate(b.slots.slot_date)} · {formatHour(b.slots.start_hour)}</span>
                          <span style={{ color: '#333', fontSize: '11px', textTransform: 'uppercase' }}>Completed</span>
                        </div>
                      ))}
                    </div>
                  )
                })
              )}
            </div>
          )}

          {/* ── LIBRARY TAB ── */}
          {activeTab === 'library' && (
            <div>
              {libraryLoading ? (
                <p style={{ color: '#444', fontSize: '13px' }}>Loading library…</p>
              ) : libraryItems.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '42px 16px', color: '#333' }}>
                  <div style={{ fontSize: '38px', marginBottom: '16px' }}>📚</div>
                  <div style={{ fontSize: '13px' }}>No resources uploaded yet. Check back soon.</div>
                </div>
              ) : (
                <>
                  {/* Category filter pills */}
                  {libCategories.length > 1 && (
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '26px' }}>
                      {libCategories.map(c => (
                        <button key={c} onClick={() => setLibraryFilter(c)}
                          style={{ padding: '6px 16px', borderRadius: '20px', border: 'none', cursor: 'pointer', fontSize: '11px', fontWeight: libraryFilter === c ? 'bold' : 'normal', background: libraryFilter === c ? '#cc0000' : '#1a1a1a', color: '#fff', textTransform: c === 'all' ? 'none' : 'capitalize', letterSpacing: '0.5px' }}>
                          {c === 'all' ? 'All' : c}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Videos grid */}
                  {libVideos.length > 0 && (
                    <div style={{ marginBottom: '26px' }}>
                      <div style={{ color: '#cc0000', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '16px' }}>▶ Videos</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '16px' }}>
                        {libVideos.map(item => {
                          const embedUrl = getEmbedUrl(item.file_url)
                          const isActive = activeLibraryVideo === item.id
                          return (
                            <div key={item.id} style={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: '10px', overflow: 'hidden' }}>
                              {isActive && embedUrl ? (
                                <div style={{ position: 'relative', paddingBottom: '56.25%', background: '#000' }}>
                                  <iframe src={embedUrl + '?autoplay=1'} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                                </div>
                              ) : isActive && !embedUrl ? (
                                <div style={{ position: 'relative', paddingBottom: '56.25%', background: '#000' }}>
                                  <video src={item.file_url} controls autoPlay style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
                                </div>
                              ) : (
                                <div onClick={() => setActiveLibraryVideo(item.id)}
                                  style={{ paddingBottom: '56.25%', position: 'relative', background: '#080808', cursor: 'pointer' }}>
                                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <div style={{ width: '42px', height: '42px', background: '#cc0000', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 20px rgba(204,0,0,0.4)' }}>
                                      <span style={{ color: '#fff', fontSize: '16px', marginLeft: '3px' }}>▶</span>
                                    </div>
                                  </div>
                                </div>
                              )}
                              <div style={{ padding: '10px 16px' }}>
                                <div style={{ color: '#fff', fontWeight: 'bold', fontSize: '13px', marginBottom: '4px' }}>{item.title}</div>
                                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                  {item.category && <span style={{ color: '#cc0000', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{item.category}</span>}
                                  {item.description && <span style={{ color: '#444', fontSize: '11px' }}>{item.description}</span>}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* PDFs list */}
                  {libPdfs.length > 0 && (
                    <div>
                      <div style={{ color: '#cc0000', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '16px' }}>📄 Documents</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {libPdfs.map(item => (
                          <a key={item.id} href={item.file_url} target="_blank" rel="noopener noreferrer"
                            style={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: '10px', padding: '13px 16px', display: 'flex', alignItems: 'center', gap: '16px', textDecoration: 'none', transition: 'border-color 0.15s' }}
                            onMouseEnter={e => e.currentTarget.style.borderColor = '#cc0000'}
                            onMouseLeave={e => e.currentTarget.style.borderColor = '#1a1a1a'}>
                            <span style={{ fontSize: '24px', flexShrink: 0 }}>📄</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ color: '#fff', fontWeight: 'bold', fontSize: '13px' }}>{item.title}</div>
                              <div style={{ display: 'flex', gap: '10px', marginTop: '2px' }}>
                                {item.category && <span style={{ color: '#cc0000', fontSize: '11px', textTransform: 'uppercase' }}>{item.category}</span>}
                                {item.description && <span style={{ color: '#444', fontSize: '11px' }}>{item.description}</span>}
                              </div>
                            </div>
                            <span style={{ color: '#333', fontSize: '11px', flexShrink: 0 }}>Open →</span>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── NOTIFICATIONS TAB ── */}
          {activeTab === 'notifications' && (
            <div style={{ maxWidth: '480px' }}>
              <p style={{ color: '#555', fontSize: '13px', marginBottom: '26px' }}>Choose how and when to receive reminders before your upcoming lessons.</p>

              {'Notification' in window && (
                <div style={{ background: '#111', border: `1px solid ${pushEnabled ? '#cc0000' : '#1a1a1a'}`, borderRadius: '10px', padding: '16px 26px', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ color: '#fff', fontWeight: 'bold', fontSize: '13px' }}>Push notifications</div>
                    <div style={{ color: '#444', fontSize: '11px', marginTop: '2px' }}>{pushEnabled ? 'Enabled on this device' : 'Get alerts even when the app is closed'}</div>
                  </div>
                  <button onClick={togglePush} disabled={pushLoading}
                    style={{ width: '48px', height: '26px', borderRadius: '13px', border: 'none', cursor: pushLoading ? 'default' : 'pointer', background: pushEnabled ? '#cc0000' : '#222', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                    <span style={{ position: 'absolute', top: '3px', left: pushEnabled ? '25px' : '3px', width: '20px', height: '20px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
                  </button>
                </div>
              )}

              <div style={{ color: '#333', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' }}>Email reminders</div>

              {[
                { key: 'notify_48h', label: '48 hours before' },
                { key: 'notify_24h', label: '24 hours before' },
                { key: 'notify_12h', label: '12 hours before' },
                { key: 'notify_2h',  label: '2 hours before' },
              ].map(({ key, label }) => {
                const enabled = profile?.[key] !== false
                return (
                  <div key={key} style={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: '10px', padding: '13px 26px', marginBottom: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ color: '#fff', fontWeight: 'bold', fontSize: '13px' }}>{label}</div>
                      <div style={{ color: '#444', fontSize: '11px', marginTop: '2px' }}>Email reminder</div>
                    </div>
                    <button onClick={() => saveNotifPref(key, !enabled)} disabled={notifSaving}
                      style={{ width: '48px', height: '26px', borderRadius: '13px', border: 'none', cursor: notifSaving ? 'default' : 'pointer', background: enabled ? '#cc0000' : '#222', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                      <span style={{ position: 'absolute', top: '3px', left: enabled ? '25px' : '3px', width: '20px', height: '20px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
                    </button>
                  </div>
                )
              })}
              {notifSaved && <p style={{ color: '#4caf50', fontSize: '13px', marginTop: '6px' }}>Saved</p>}

              {/* Away Mode */}
              <div style={{ marginTop: '26px', borderTop: '1px solid #1a1a1a', paddingTop: '26px' }}>
                <div style={{ color: '#333', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' }}>Away Mode</div>
                {awayMode ? (
                  <div style={{ background: '#1a1200', border: '1px solid #886600', borderRadius: '10px', padding: '16px 26px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ color: '#ffcc00', fontWeight: 'bold', fontSize: '13px' }}>Currently Away</div>
                      <div style={{ color: '#aa9933', fontSize: '11px', marginTop: '2px' }}>{awayUntil ? `Until ${new Date(awayUntil + 'T00:00:00').toLocaleDateString('en-CA', { month: 'long', day: 'numeric' })}` : 'Indefinitely'}</div>
                    </div>
                    <button onClick={clearAway} disabled={awayLoading} style={{ padding: '6px 16px', background: '#cc0000', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>
                      {awayLoading ? '...' : "I'm Back"}
                    </button>
                  </div>
                ) : (
                  <div style={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: '10px', padding: '16px 26px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ color: '#fff', fontWeight: 'bold', fontSize: '13px' }}>Going away?</div>
                      <div style={{ color: '#444', fontSize: '11px', marginTop: '2px' }}>Pause lessons & notifications while away</div>
                    </div>
                    <button onClick={() => setAwayModal(true)} style={{ padding: '6px 16px', background: '#1a1a1a', color: '#ffcc00', border: '1px solid #886600', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', whiteSpace: 'nowrap' }}>
                      Set Away
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── SIDEBAR (38.2%) ──────────────────────────────────────────────────── */}
        <div style={{ flex: '0 1 320px', minWidth: '260px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Token Card */}
          <div style={{ background: '#150000', border: '1px solid #cc0000', borderRadius: '10px', padding: '16px 26px', boxShadow: '0 0 30px rgba(204,0,0,0.1)' }}>
            <div style={{ color: '#cc0000', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '6px' }}>Lesson Tokens</div>
            <div style={{ fontSize: '38px', fontWeight: 'bold', color: '#fff', lineHeight: 1 }}>{balance}</div>
            <div style={{ display: 'flex', gap: '6px', marginTop: '10px', flexWrap: 'wrap' }}>
              {Array.from({ length: Math.min(balance, 10) }, (_, i) => (
                <div key={i} style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#cc0000' }} />
              ))}
              {balance > 10 && <span style={{ color: '#664444', fontSize: '11px' }}>+{balance - 10}</span>}
            </div>
            <div style={{ color: '#442222', fontSize: '11px', marginTop: '10px' }}>4 tokens/month · renews monthly</div>
          </div>

          {/* Mini Calendar */}
          <div style={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: '10px', padding: '16px' }}>
            <MiniCalendar bookings={upcomingBookings} />
          </div>

          {/* Quick Actions */}
          <div style={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: '10px', padding: '16px 26px' }}>
            <div style={{ color: '#333', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '10px' }}>Quick Actions</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <a href="/book" style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 13px', background: '#cc0000', color: '#fff', textDecoration: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 'bold' }}>
                <span>＋</span> Book a Lesson
              </a>
              <button onClick={() => setActiveTab('library')} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 13px', background: '#1a1a1a', color: '#aaa', border: 'none', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                <span>📚</span> Library
              </button>
              <button onClick={() => setActiveTab('notifications')} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 13px', background: '#1a1a1a', color: '#aaa', border: 'none', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                <span>🔔</span> Notifications
              </button>
            </div>
          </div>

          {/* School Info */}
          <div style={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: '10px', padding: '16px 26px' }}>
            <div style={{ color: '#333', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '10px' }}>School</div>
            <div style={{ color: '#fff', fontSize: '13px', fontWeight: 'bold', marginBottom: '4px' }}>SKF Academy</div>
            <div style={{ color: '#444', fontSize: '11px', marginBottom: '10px' }}>Shaolin Kung Fu · Est. 1986</div>
            <div style={{ color: '#333', fontSize: '11px', lineHeight: '1.6' }}>
              Traditional Shaolin Kung Fu<br />Private lessons · All levels
            </div>
          </div>

        </div>
      </div>

      {/* ── Cancel Prompt Modal ───────────────────────────────────────────────── */}
      {cancelPrompt && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: '#111', border: '1px solid #cc0000', borderRadius: '10px', padding: '26px', maxWidth: '380px', width: '100%' }}>
            <h3 style={{ color: '#fff', margin: '0 0 10px', fontSize: '15px' }}>Cancel Booking</h3>
            {cancelPrompt.within24 && (
              <div style={{ background: '#1a0a00', border: '1px solid #aa5500', borderRadius: '8px', padding: '10px 16px', marginBottom: '16px' }}>
                <div style={{ color: '#ff8800', fontWeight: 'bold', fontSize: '13px', marginBottom: '2px' }}>⚠️ Within 24 hours — No Refund</div>
                <div style={{ color: '#aa7744', fontSize: '11px' }}>Your token will not be refunded as this lesson is less than 24 hours away.</div>
              </div>
            )}
            {cancelPrompt.hasSeries ? (
              <>
                <p style={{ color: '#777', fontSize: '13px', marginBottom: '16px' }}>This is part of a recurring series ({cancelPrompt.seriesCount} lessons). What would you like to cancel?</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <button onClick={() => doCancel(cancelPrompt.booking, false)} style={{ padding: '13px', background: '#1a1a1a', color: '#fff', border: '1px solid #333', borderRadius: '8px', cursor: 'pointer', textAlign: 'left' }}>
                    <div style={{ fontWeight: 'bold', fontSize: '13px', marginBottom: '2px' }}>This lesson only</div>
                    <div style={{ color: '#555', fontSize: '11px' }}>{cancelPrompt.within24 ? 'No token refund (within 24h)' : 'Refund 1 token'}</div>
                  </button>
                  <button onClick={() => doCancel(cancelPrompt.booking, true)} style={{ padding: '13px', background: '#160000', color: '#fff', border: '1px solid #cc0000', borderRadius: '8px', cursor: 'pointer', textAlign: 'left' }}>
                    <div style={{ fontWeight: 'bold', fontSize: '13px', marginBottom: '2px' }}>All remaining in this series</div>
                    <div style={{ color: '#884444', fontSize: '11px' }}>{cancelPrompt.within24 ? `This lesson: no refund. Future: ${cancelPrompt.seriesCount - 1} tokens` : `Refund ${cancelPrompt.seriesCount} tokens`}</div>
                  </button>
                  <button onClick={() => setCancelPrompt(null)} style={{ padding: '10px', background: 'transparent', color: '#444', border: '1px solid #222', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>Keep my booking</button>
                </div>
              </>
            ) : (
              <>
                <p style={{ color: '#777', fontSize: '13px', marginBottom: '16px' }}>
                  {formatDate(cancelPrompt.booking.slots.slot_date)} at {formatHour(cancelPrompt.booking.slots.start_hour)}<br />
                  {cancelPrompt.within24 ? 'Your token will not be refunded.' : 'You will receive a 1 token refund.'}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <button onClick={() => doCancel(cancelPrompt.booking, false)} style={{ padding: '13px', background: '#cc0000', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>Confirm Cancellation</button>
                  <button onClick={() => setCancelPrompt(null)} style={{ padding: '10px', background: 'transparent', color: '#444', border: '1px solid #222', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>Keep my booking</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Away Modal ────────────────────────────────────────────────────────── */}
      {awayModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: '#111', border: '1px solid #886600', borderRadius: '10px', padding: '26px', maxWidth: '360px', width: '100%' }}>
            <h3 style={{ color: '#ffcc00', margin: '0 0 6px', fontSize: '15px' }}>🌴 Set Away Mode</h3>
            <p style={{ color: '#777', fontSize: '13px', margin: '0 0 26px' }}>Your upcoming bookings will be cancelled and tokens refunded. Notifications will be paused until you return.</p>
            <div style={{ marginBottom: '26px' }}>
              <label style={{ display: 'block', color: '#555', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>Return date (optional)</label>
              <input type="date" value={awayUntilInput} min={today} onChange={e => setAwayUntilInput(e.target.value)}
                style={{ width: '100%', padding: '10px', background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', color: '#fff', fontSize: '13px', boxSizing: 'border-box', colorScheme: 'dark' }} />
              <div style={{ color: '#333', fontSize: '11px', marginTop: '4px' }}>Leave blank to pause indefinitely</div>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => { setAwayModal(false); setAwayUntilInput('') }} style={{ flex: 1, padding: '10px', background: 'transparent', border: '1px solid #222', borderRadius: '8px', color: '#555', cursor: 'pointer', fontSize: '13px' }}>Cancel</button>
              <button onClick={activateAway} disabled={awayLoading} style={{ flex: 2, padding: '10px', background: '#886600', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>
                {awayLoading ? 'Setting Away…' : 'Go Away'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
