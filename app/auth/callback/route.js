import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const token_hash = requestUrl.searchParams.get('token_hash')
  const type = requestUrl.searchParams.get('type')

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )

  if (code) {
    await supabase.auth.exchangeCodeForSession(code)
  }

  if (token_hash && type === 'recovery') {
    await supabase.auth.verifyOtp({ token_hash, type: 'recovery' })
    return NextResponse.redirect(new URL('/reset-password', requestUrl.origin))
  }

  if (token_hash && type === 'email') {
    await supabase.auth.verifyOtp({ token_hash, type })
  }

  return NextResponse.redirect(new URL('/dashboard', requestUrl.origin))
}