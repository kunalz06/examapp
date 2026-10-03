import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

function publicOrigin(request: Request) {
  const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host')
  const forwardedProto = request.headers.get('x-forwarded-proto') || 'https'
  if (forwardedHost) return `${forwardedProto}://${forwardedHost}`
  return 'https://examapp-seven.vercel.app'
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { email?: string } | null
  const email = String(body?.email || '').trim().toLowerCase()

  if (!email || !email.includes('@') || email.length > 320) {
    return NextResponse.json({ ok: true })
  }

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  )

  const redirectTo = `${publicOrigin(request)}/login?verified=1`

  // A magic-link challenge proves ownership of the mailbox for both legacy
  // invite-created users and current signup-created users. User creation is
  // explicitly disabled, so this endpoint cannot be used as a signup path.
  await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: redirectTo,
    },
  })

  // Always return the same response to avoid revealing whether an email exists.
  return NextResponse.json({ ok: true })
}
