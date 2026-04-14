'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabase'

const RED = '#cc0000'
const MID = '#2a2a2a'
const HOURS = [10,11,12,13,14,15,16,17,18,19,20,21]
const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

function fmt(h) { return h < 12 ? h+':00 AM' : h === 12 ? '12:00 PM' : (h-12)+':00 PM' }
function w24(date, hour) { return (new Date(date+'T'+String(hour).padStart(2,'0')+':00:00') - new Date()) < 86400000 }
function getWeek(offset) {
  const now = new Date()
  const local = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dow = local.getDay()
  const mon = new Date(local)
  mon.setDate(local.getDate() - (dow === 0 ? 6 : dow - 1) + offset * 7)
  return Array.from({length:7}, (_,i) => { const d=new Date(mon.getFullYear(),mon.getMonth(),mon.getDate()+i); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0') })
}
function sname(u) { if(!u) return 'Unknown'; return u.full_name||[u.first_name,u.last_name].filter(Boolean).join(' ')||u.email||'Guest' }
const inp = (v,s,t='text',p='') => <input type={t} value={v} onChange={e=>s(e.target.value)} placeholder={p} style={{width:'100%',padding:'0.6rem',background:MID,color:'#fff',border:'1px solid #444',borderRadius:'6px',fontSize:'0.9rem',boxSizing:'border-box'}} />
const sel = (v,s,o) => <select value={v} onChange={e=>s(e.target.value)} style={{width:'100%',padding:'0.6rem',background:MID,color:'#fff',border:'1px solid #444',borderRadius:'6px',fontSize:'0.9rem',boxSizing:'border-box'}}>{o}</select>
const lbl = t => <div style={{color:'#666',fontSize:'0.75rem',textTransform:'uppercase',letterSpacing:'1px',marginBottom:'0.4rem',marginTop:'1rem'}}>{t}</div>

export default function Admin() {
  const [bookings,setBookings] = useState([])
  const [students,setStudents] = useState([])
  const [blocked,setBlocked] = useState([])
  const [wOff,setWOff] = useState(0)
  const [tab,setTab] = useState('week')
  const [msg,setMsg] = useState('')
  const [busy,setBusy] = useState(false)
  const [showBook,setShowBook] = useState(false)
  const [bType,setBType] = useState('registered')
  const [bStudent,setBStudent] = useState('')
  const [bDate,setBDate] = useState('')
  const [bHour,setBHour] = useState(10)
  const [bFirst,setBFirst] = useState('')
  const [bLast,setBLast] = useState('')
  const [bPhone,setBPhone] = useState('')
  const [bRecurring,setBRecurring] = useState(false)
  const [bWeeks,setBWeeks] = useState(4)
  const [showBlk,setShowBlk] = useState(false)
  const [blkDate,setBlkDate] = useState('')
  const [blkHour,setBlkHour] = useState(10)
  const [blkReason,setBlkReason] = useState('')
  const [blkEndHour,setBlkEndHour] = useState(21)

  const week = getWeek(wOff)
  const wStart = week[0]
  const wEnd = week[6]

  const load = useCallback(async () => {
    const [r1,r2,r3] = await Promise.all([
      supabase.from('bookings').select('id,status,attendance,tenant_id,student_id,slots!bookings_slot_id_fkey(id,slot_date,start_hour),users!bookings_student_id_fkey(id,full_name,first_name,last_name,email,phone)').in('status',['confirmed','cancelled']).order('booked_at',{ascending:false}),
      supabase.from('users').select('id,first_name,last_name,full_name,email,phone,belt_rank').eq('role','student').order('first_name'),
      supabase.from('slots').select('id,slot_date,start_hour,is_blocked,block_reason').eq('is_blocked',true).gte('slot_date',new Date().toISOString().split('T')[0])
    ])
    setBookings((r1.data||[]).filter(b=>b.slots))
    setStudents(r2.data||[])
    setBlocked(r3.data||[])
  },[])

  useEffect(() => {
    supabase.auth.getUser().then(({data:{user}}) => { if(!user){window.location.href='/login';return}; load() })
  },[load])

  function flash(m) { setMsg(m); setTimeout(()=>setMsg(''),4000) }

  const wBook = bookings.filter(b=>b.status==='confirmed'&&b.slots?.slot_date>=wStart&&b.slots?.slot_date<=wEnd)
  const getCell = (d,h) => wBook.filter(b=>b.slots?.slot_date===d&&b.slots?.start_hour===h)
  const getBlk = (d,h) => blocked.find(s=>s.slot_date===d&&s.start_hour===h)

  async function setAtt(id,val) {
    await supabase.from('bookings').update({attendance:val}).eq('id',id)
    setBookings(prev=>prev.map(b=>b.id===id?{...b,attendance:val}:b))
  }

  async function cancel(b) {
    if(!confirm('Cancel '+sname(b.users)+' on '+b.slots.slot_date+' at '+fmt(b.slots.start_hour)+'?')) return
    setBusy(true)
    const now = new Date()
    const within = w24(b.slots.slot_date,b.slots.start_hour)
    await supabase.from('bookings').update({status:'cancelled',cancelled_at:now.toISOString(),cancelled_by:'admin'}).eq('id',b.id)
    if(!within) await supabase.from('tokens').insert({tenant_id:b.tenant_id,student_id:b.student_id,amount:1,reason:'admin cancelled - refund',booking_id:b.id})
    const u = b.users
    if(u?.email&&!u.email.includes('@skf-academy.internal')) {
      await fetch('/api/send-email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'cancellation',studentEmail:u.email,studentName:sname(u),phone:u.phone||'',date:b.slots.slot_date,time:fmt(b.slots.start_hour),hour:b.slots.start_hour})})
    }
    setBookings(prev=>prev.map(x=>x.id===b.id?{...x,status:'cancelled'}:x))
    flash('Cancelled'+(within?' (no refund)':' + 1 token refunded'))
    setBusy(false)
  }

  async function book() {
    if(!bDate){flash('Select a date');return}
    if(bType==='registered'&&!bStudent){flash('Select a student');return}
    if(bType==='guest'&&!bFirst){flash('Enter guest name');return}
    setBusy(true)
    const {data:slot} = await supabase.from('slots').select('id,tenant_id').eq('slot_date',bDate).eq('start_hour',bHour).maybeSingle()
    if(!slot){flash('No slot found for that date/time');setBusy(false);return}
    const payload = {slotId:slot.id}
    if(bType==='registered') payload.studentId=bStudent
    else {payload.guestFirstName=bFirst;payload.guestLastName=bLast;payload.guestPhone=bPhone}
    const res = await fetch('/api/admin-book',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
    const data = await res.json()
    if(!res.ok){flash('Error: '+data.error);setBusy(false);return}
    flash('Booked for '+data.studentName)
    setShowBook(false);setBStudent('');setBDate('');setBFirst('');setBLast('');setBPhone('')
    load();setBusy(false)
  }

  async function blockIt() {
    if(!blkDate){flash('Select a date');return}
    if(blkEndHour < blkHour){flash('End time must be after start time');return}
    const hours = []
    for(let h = blkHour; h <= blkEndHour; h++) hours.push(h)
    await supabase.from('slots').update({is_blocked:true,block_reason:blkReason||'Unavailable'}).eq('slot_date',blkDate).in('start_hour',hours)
    flash('Blocked ' + hours.length + ' slot' + (hours.length > 1 ? 's' : '') + ' on ' + blkDate)
    setShowBlk(false);setBlkDate('');setBlkReason('');setBlkEndHour(21);load()
  }

  async function unblock(s) {
    await supabase.from('slots').update({is_blocked:false,block_reason:null}).eq('id',s.id)
    setBlocked(prev=>prev.filter(x=>x.id!==s.id));flash('Unblocked')
  }

  const modal = (title,body,onClose) => (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:'1rem'}}>
      <div style={{background:'#1a1a1a',border:'1px solid '+RED,borderRadius:'12px',padding:'1.5rem',maxWidth:'460px',width:'100%',maxHeight:'90vh',overflowY:'auto'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.25rem'}}>
          <h3 style={{color:'#fff',margin:0}}>{title}</h3>
          <button onClick={onClose} style={{background:'transparent',border:'none',color:'#666',cursor:'pointer',fontSize:'1.2rem'}}>✕</button>
        </div>
        {body}
      </div>
    </div>
  )

  const tabBtn = (k,l) => <button onClick={()=>setTab(k)} style={{padding:'0.5rem 1rem',background:tab===k?RED:'transparent',color:'#fff',border:'1px solid '+(tab===k?RED:'#444'),borderRadius:'6px',cursor:'pointer',fontSize:'0.85rem',fontWeight:tab===k?'bold':'normal'}}>{l}</button>

  return (
    <main style={{maxWidth:'1100px',margin:'0 auto',padding:'1.5rem 1rem'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.5rem'}}>
        <h1 style={{color:'#fff',margin:0,fontSize:'1.2rem'}}>SKF Academy — Admin</h1>
        <button onClick={()=>supabase.auth.signOut().then(()=>window.location.href='/login')} style={{padding:'0.4rem 0.9rem',background:'transparent',color:'#666',border:'1px solid #444',borderRadius:'6px',cursor:'pointer',fontSize:'0.8rem'}}>Sign Out</button>
      </div>

      {msg&&<div style={{background:msg.startsWith('Error')?'#3a0000':'#0a2a0a',border:'1px solid '+(msg.startsWith('Error')?RED:'#2a6a2a'),color:msg.startsWith('Error')?'#ff6666':'#66cc66',padding:'0.75rem 1rem',borderRadius:'6px',marginBottom:'1rem',fontSize:'0.9rem'}}>{msg}</div>}

      <div style={{display:'flex',gap:'0.5rem',marginBottom:'1.5rem',flexWrap:'wrap',alignItems:'center'}}>
        {tabBtn('week','📅 Week View')}
        {tabBtn('bookings','📋 All Bookings')}
        {tabBtn('students','👥 Students')}
        {tabBtn('block','🔒 Block Slots')}
        <button onClick={()=>setShowBook(true)} style={{padding:'0.5rem 1rem',background:RED,color:'#fff',border:'none',borderRadius:'6px',cursor:'pointer',fontSize:'0.85rem',fontWeight:'bold',marginLeft:'auto'}}>+ Book a Lesson</button>
      </div>

      {tab==='week'&&(
        <div>
          <div style={{display:'flex',alignItems:'center',gap:'1rem',marginBottom:'1rem'}}>
            <button onClick={()=>setWOff(w=>w-1)} style={{padding:'0.4rem 0.9rem',background:MID,color:'#fff',border:'1px solid #444',borderRadius:'6px',cursor:'pointer'}}>← Prev</button>
            <span style={{color:'#fff',fontWeight:'bold'}}>{wStart} — {wEnd}</span>
            <button onClick={()=>setWOff(w=>w+1)} style={{padding:'0.4rem 0.9rem',background:MID,color:'#fff',border:'1px solid #444',borderRadius:'6px',cursor:'pointer'}}>Next →</button>
          </div>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',minWidth:'700px'}}>
              <thead>
                <tr>
                  <th style={{color:'#555',fontSize:'0.75rem',padding:'0.5rem',textAlign:'left',width:'70px'}}>TIME</th>
                  {week.map((date,i)=>{
                    const n=new Date();const isToday=date===n.getFullYear()+"-"+String(n.getMonth()+1).padStart(2,"0")+"-"+String(n.getDate()).padStart(2,"0")
                    const cnt=wBook.filter(b=>b.slots?.slot_date===date).length
                    return <th key={date} style={{color:isToday?RED:'#ccc',fontSize:'0.8rem',padding:'0.5rem',textAlign:'center',borderBottom:'1px solid #333'}}>
                      <div>{DAYS[i]}</div>
                      <div style={{fontSize:'1.1rem',fontWeight:'bold'}}>{date.split('-')[2]}</div>
                      {cnt>0&&<div style={{background:RED,color:'#fff',borderRadius:'50%',width:'18px',height:'18px',fontSize:'0.65rem',display:'flex',alignItems:'center',justifyContent:'center',margin:'2px auto 0'}}>{cnt}</div>}
                    </th>
                  })}
                </tr>
              </thead>
              <tbody>
                {HOURS.map(hour=>(
                  <tr key={hour} style={{borderBottom:'1px solid #1a1a1a'}}>
                    <td style={{color:'#555',fontSize:'0.75rem',padding:'0.4rem 0.5rem',whiteSpace:'nowrap',verticalAlign:'top'}}>{fmt(hour)}</td>
                    {week.map(date=>{
                      const cells=getCell(date,hour)
                      const blk=getBlk(date,hour)
                      return <td key={date} style={{padding:'0.2rem',verticalAlign:'top',minWidth:'110px'}}>
                        {blk?<div style={{background:'#221500',border:'1px solid #553300',borderRadius:'4px',padding:'0.3rem 0.5rem',fontSize:'0.7rem',color:'#aa6600'}}>
                          🔒 {blk.block_reason||'Blocked'}
                          <button onClick={()=>unblock(blk)} style={{display:'block',marginTop:'0.2rem',background:'transparent',border:'none',color:'#555',cursor:'pointer',fontSize:'0.65rem',padding:0}}>unblock</button>
                        </div>:cells.map(b=>(
                          <div key={b.id} style={{background:MID,border:'1px solid #383838',borderRadius:'4px',padding:'0.3rem 0.5rem',marginBottom:'0.2rem'}}>
                            <div style={{color:'#fff',fontWeight:'bold',fontSize:'0.78rem',marginBottom:'0.15rem'}}>{sname(b.users)}</div>
                            <div style={{color:'#555',fontSize:'0.65rem',marginBottom:'0.25rem'}}>Private Lesson</div>
                            <div style={{display:'flex',gap:'0.2rem'}}>
                              <button onClick={()=>setAtt(b.id,'attended')} style={{padding:'0.15rem 0.35rem',background:b.attendance==='attended'?'#1a3a1a':'transparent',color:b.attendance==='attended'?'#66cc66':'#444',border:'1px solid '+(b.attendance==='attended'?'#2a5a2a':'#333'),borderRadius:'3px',cursor:'pointer',fontSize:'0.7rem'}}>✓</button>
                              <button onClick={()=>setAtt(b.id,'dns')} style={{padding:'0.15rem 0.35rem',background:b.attendance==='dns'?'#3a1500':'transparent',color:b.attendance==='dns'?'#cc6633':'#444',border:'1px solid '+(b.attendance==='dns'?'#5a2500':'#333'),borderRadius:'3px',cursor:'pointer',fontSize:'0.7rem'}}>DNS</button>
                              <button onClick={()=>cancel(b)} style={{padding:'0.15rem 0.35rem',background:'transparent',color:'#882222',border:'1px solid #331111',borderRadius:'3px',cursor:'pointer',fontSize:'0.7rem'}}>✗</button>
                            </div>
                          </div>
                        ))}
                      </td>
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab==='bookings'&&(
        <div>
          <h3 style={{color:'#fff',marginBottom:'1rem'}}>All Bookings</h3>
          {bookings.slice(0,100).map(b=>(
            <div key={b.id} style={{background:MID,border:'1px solid #333',borderRadius:'8px',padding:'0.75rem 1rem',marginBottom:'0.5rem',display:'flex',justifyContent:'space-between',alignItems:'center',opacity:b.status==='cancelled'?0.6:1}}>
              <div>
                <span style={{color:'#fff',fontWeight:'bold'}}>{sname(b.users)}</span>
                <span style={{color:'#666',marginLeft:'0.75rem',fontSize:'0.85rem'}}>{b.slots?.slot_date} at {fmt(b.slots?.start_hour)}</span>
                {b.status==='cancelled'&&<span style={{color:'#cc6666',marginLeft:'0.5rem',fontSize:'0.8rem'}}>cancelled</span>}
                {b.attendance==='attended'&&<span style={{color:'#66cc66',marginLeft:'0.5rem',fontSize:'0.8rem'}}>✓ attended</span>}
                {b.attendance==='dns'&&<span style={{color:'#cc6633',marginLeft:'0.5rem',fontSize:'0.8rem'}}>✗ dns</span>}
              </div>
              {b.status==='confirmed'&&<button onClick={()=>cancel(b)} style={{padding:'0.3rem 0.7rem',background:'transparent',color:RED,border:'1px solid '+RED,borderRadius:'4px',cursor:'pointer',fontSize:'0.8rem'}}>Cancel</button>}
            </div>
          ))}
        </div>
      )}

      {tab==='students'&&(
        <div>
          <h3 style={{color:'#fff',marginBottom:'1rem'}}>Students ({students.length})</h3>
          {students.map(s=>{
            const name=s.full_name||(([s.first_name,s.last_name].filter(Boolean).join(' ')||s.email)+' ('+s.email+')')+' ('+s.email+')'
            const upcoming=bookings.filter(b=>b.student_id===s.id&&b.status==='confirmed').length
            return <div key={s.id} style={{background:MID,border:'1px solid #333',borderRadius:'8px',padding:'0.75rem 1rem',marginBottom:'0.5rem',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div>
                <span style={{color:'#fff',fontWeight:'bold'}}>{name}</span>
                {s.belt_rank&&<span style={{color:'#666',marginLeft:'0.5rem',fontSize:'0.8rem',textTransform:'capitalize'}}>{s.belt_rank} belt</span>}
                <div style={{color:'#555',fontSize:'0.8rem',marginTop:'0.2rem'}}>{s.email}{s.phone?' · '+s.phone:''}</div>
                {upcoming>0&&<div style={{color:'#aa6600',fontSize:'0.75rem',marginTop:'0.2rem'}}>{upcoming} upcoming</div>}
              </div>
              <TokenAdjust studentId={s.id} />
            </div>
          })}
        </div>
      )}

      {tab==='block'&&(
        <div>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
            <h3 style={{color:'#fff',margin:0}}>Blocked Slots</h3>
            <button onClick={()=>setShowBlk(true)} style={{padding:'0.5rem 1rem',background:RED,color:'#fff',border:'none',borderRadius:'6px',cursor:'pointer',fontSize:'0.85rem'}}>+ Block a Slot</button>
          </div>
          {blocked.length===0?<p style={{color:'#666'}}>No blocked slots.</p>:blocked.map(s=>(
            <div key={s.id} style={{background:MID,border:'1px solid #333',borderRadius:'8px',padding:'0.75rem 1rem',marginBottom:'0.5rem',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div><span style={{color:'#fff'}}>{s.slot_date} at {fmt(s.start_hour)}</span>{s.block_reason&&<span style={{color:'#666',marginLeft:'0.5rem',fontSize:'0.85rem'}}>— {s.block_reason}</span>}</div>
              <button onClick={()=>unblock(s)} style={{padding:'0.3rem 0.7rem',background:'transparent',color:'#666',border:'1px solid #444',borderRadius:'4px',cursor:'pointer',fontSize:'0.8rem'}}>Unblock</button>
            </div>
          ))}
        </div>
      )}

      {showBook&&modal('+ Book a Lesson',(
        <div>
          <div style={{display:'flex',gap:'0.5rem',marginBottom:'1rem'}}>
            {['registered','guest'].map(t=>(
              <button key={t} onClick={()=>setBType(t)} style={{flex:1,padding:'0.5rem',background:bType===t?RED:MID,color:'#fff',border:'1px solid '+(bType===t?RED:'#444'),borderRadius:'6px',cursor:'pointer',fontSize:'0.85rem'}}>{t==='registered'?'Registered Student':'Guest / Trial'}</button>
            ))}
          </div>
          {bType==='registered'?<>{lbl('Student')}{sel(bStudent,setBStudent,[<option key="" value="">Select student...</option>,...students.map(s=><option key={s.id} value={s.id}>{[s.first_name,s.last_name].filter(Boolean).join(' ')||s.email}</option>)])}</>:<>{lbl('First Name')}{inp(bFirst,setBFirst,'text','First name')}{lbl('Last Name')}{inp(bLast,setBLast,'text','Last name (optional)')}{lbl('Phone')}{inp(bPhone,setBPhone,'tel','Phone number')}</>}
          {lbl('Date')}{inp(bDate,setBDate,'date')}
          {lbl('Time')}{sel(bHour,h=>setBHour(Number(h)),HOURS.map(h=><option key={h} value={h}>{fmt(h)}</option>))}
          <div style={{display:'flex',alignItems:'center',gap:'0.75rem',marginTop:'1rem'}}><input type='checkbox' id='recur' checked={bRecurring} onChange={e=>setBRecurring(e.target.checked)} style={{width:'18px',height:'18px',cursor:'pointer'}} /><label htmlFor='recur' style={{color:'#ccc',fontSize:'0.9rem',cursor:'pointer'}}>Recurring Weekly</label></div>
          {bRecurring&&<>{lbl('Number of Weeks')}{sel(bWeeks,w=>setBWeeks(Number(w)),[4,6,8,10,12,16,24,52].map(w=><option key={w} value={w}>{w} weeks</option>))}</>}
          <button onClick={book} disabled={busy} style={{width:'100%',marginTop:'1.5rem',padding:'0.85rem',background:RED,color:'#fff',border:'none',borderRadius:'8px',cursor:'pointer',fontWeight:'bold',fontSize:'1rem'}}>{busy?'Booking...':'Book Lesson'}</button>
        </div>
      ),()=>setShowBook(false))}

      {showBlk&&modal('🔒 Block a Slot',(
        <div>
          {lbl('Date')}{inp(blkDate,setBlkDate,'date')}
          {lbl('Start Time')}{sel(blkHour,h=>setBlkHour(Number(h)),HOURS.map(h=><option key={h} value={h}>{fmt(h)}</option>))}{lbl('End Time')}{sel(blkEndHour,h=>setBlkEndHour(Number(h)),HOURS.map(h=><option key={h} value={h}>{fmt(h)}</option>))}
          {lbl('Reason (optional)')}{inp(blkReason,setBlkReason,'text','e.g. Day off, Tournament...')}
          <button onClick={blockIt} disabled={busy} style={{width:'100%',marginTop:'1.5rem',padding:'0.85rem',background:RED,color:'#fff',border:'none',borderRadius:'8px',cursor:'pointer',fontWeight:'bold',fontSize:'1rem'}}>Block Slot</button>
        </div>
      ),()=>setShowBlk(false))}
    </main>
  )
}

function TokenAdjust({studentId}) {
  const [bal,setBal] = useState(null)
  useEffect(()=>{
    supabase.from('tokens').select('amount').eq('student_id',studentId).then(({data})=>setBal((data||[]).reduce((s,t)=>s+t.amount,0)))
  },[studentId])
  async function adj(n) {
    const {data:u} = await supabase.from('users').select('tenant_id').eq('id',studentId).single()
    await supabase.from('tokens').insert({tenant_id:u.tenant_id,student_id:studentId,amount:n,reason:n>0?'admin added tokens':'admin removed tokens'})
    setBal(b=>b+n)
  }
  return <div style={{display:'flex',alignItems:'center',gap:'0.4rem'}}>
    <button onClick={()=>adj(-1)} style={{padding:'0.2rem 0.5rem',background:'transparent',color:'#cc6666',border:'1px solid #441111',borderRadius:'4px',cursor:'pointer',fontSize:'0.8rem'}}>-1</button>
    <span style={{color:'#fff',fontSize:'0.85rem',minWidth:'30px',textAlign:'center'}}>{bal??'...'}</span>
    <button onClick={()=>adj(1)} style={{padding:'0.2rem 0.5rem',background:'transparent',color:'#66cc66',border:'1px solid #114411',borderRadius:'4px',cursor:'pointer',fontSize:'0.8rem'}}>+1</button>
    <button onClick={()=>adj(4)} style={{padding:'0.2rem 0.5rem',background:'transparent',color:'#66cc66',border:'1px solid #114411',borderRadius:'4px',cursor:'pointer',fontSize:'0.8rem'}}>+4</button>
  </div>
}
