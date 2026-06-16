import { createClient } from '@supabase/supabase-js'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const HOURS = Array.from({ length: 12 }, (_, i) => i + 10) // 10am–9pm

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const userId = searchParams.get('userId')

  const todayLocal = new Date()
  const todayStr = todayLocal.getFullYear() + '-' +
    String(todayLocal.getMonth() + 1).padStart(2, '0') + '-' +
    String(todayLocal.getDate()).padStart(2, '0')

  const ninetyOut = new Date(todayLocal)
  ninetyOut.setDate(todayLocal.getDate() + 90)
  const maxDate = ninetyOut.getFullYear() + '-' +
    String(ninetyOut.getMonth() + 1).padStart(2, '0') + '-' +
    String(ninetyOut.getDate()).padStart(2, '0')

  // Get tenant
  const { data: tenant } = await sb.from('tenants').select('id').eq('slug', 'skf-academy').single()
  if (!tenant) return Response.json([])

  // Fetch all slots for the window (blocked or not — we need the full picture)
  // limit(2000) ensures we get all 90days × 12hours = 1080 rows past Supabase's default 1000-row cap
  const { data: existingSlots } = await sb
    .from('slots')
    .select('*')
    .gte('slot_date', todayStr)
    .lte('slot_date', maxDate)
    .limit(2000)

  // Build lookup by "date-hour"
  const existingMap = {}
  for (const s of (existingSlots || [])) {
    existingMap[`${s.slot_date}-${s.start_hour}`] = s
  }

  // Generate all expected date+hour pairs for 90 days (Mon–Fri only) and create missing ones
  const toCreate = []
  const cur = new Date(todayLocal.getFullYear(), todayLocal.getMonth(), todayLocal.getDate())
  while (true) {
    const dateStr = cur.getFullYear() + '-' +
      String(cur.getMonth() + 1).padStart(2, '0') + '-' +
      String(cur.getDate()).padStart(2, '0')
    if (dateStr > maxDate) break
    const dow = cur.getDay() // 0=Sun, 6=Sat
    if (dow !== 0 && dow !== 6) {
      for (const hour of HOURS) {
        if (!existingMap[`${dateStr}-${hour}`]) {
          toCreate.push({ tenant_id: tenant.id, slot_date: dateStr, start_hour: hour })
        }
      }
    }
    cur.setDate(cur.getDate() + 1)
  }

  // Bulk-create missing slots (upsert to avoid race conditions)
  if (toCreate.length > 0) {
    const BATCH = 500
    for (let i = 0; i < toCreate.length; i += BATCH) {
      const { data: created } = await sb
        .from('slots')
        .upsert(toCreate.slice(i, i + BATCH), { onConflict: 'slot_date,start_hour,tenant_id', ignoreDuplicates: true })
        .select()
      for (const s of (created || [])) {
        existingMap[`${s.slot_date}-${s.start_hour}`] = s
      }
    }
    // Re-fetch to pick up any that were already there (not returned by upsert ignoreDuplicates)
    if (toCreate.length > 0) {
      const { data: refreshed } = await sb
        .from('slots')
        .select('*')
        .gte('slot_date', todayStr)
        .lte('slot_date', maxDate)
      for (const s of (refreshed || [])) {
        existingMap[`${s.slot_date}-${s.start_hour}`] = s
      }
    }
  }

  const allSlots = Object.values(existingMap)
  const unblockedSlots = allSlots.filter(s => {
    if (s.is_blocked) return false
    const dow = new Date(s.slot_date + 'T00:00:00').getDay()
    return dow !== 0 && dow !== 6 // exclude Sun (0) and Sat (6)
  })
  if (unblockedSlots.length === 0) return Response.json([])

  const slotIds = unblockedSlots.map(s => s.id)

  // Fetch bookings for these slots
  const { data: bookings } = await sb
    .from('bookings')
    .select('slot_id, student_id')
    .in('slot_id', slotIds)
    .in('status', ['confirmed', 'pending_token'])

  const bookingCounts = {}
  const myBookedSlots = new Set()
  for (const b of (bookings || [])) {
    bookingCounts[b.slot_id] = (bookingCounts[b.slot_id] || 0) + 1
    if (b.student_id === userId) myBookedSlots.add(b.slot_id)
  }

  const available = unblockedSlots.filter(s => {
    if (myBookedSlots.has(s.id)) return false
    return (bookingCounts[s.id] || 0) < (s.capacity || 1)
  })

  available.sort((a, b) => a.slot_date.localeCompare(b.slot_date) || a.start_hour - b.start_hour)

  return Response.json(available)
}
