import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth'
import type { Database } from '@/lib/database.types'

function publicOrigin(request: Request) {
  const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host')
  const forwardedProto = request.headers.get('x-forwarded-proto') || 'https'
  if (forwardedHost) return `${forwardedProto}://${forwardedHost}`
  return 'https://examapp-seven.vercel.app'
}

export async function POST(request: Request) {
  const { supabase: adminSupabase, user } = await requireAdmin()

  const body = await request.json().catch(() => null) as {
    displayName?: string
    email?: string
    temporaryPassword?: string
  } | null

  if (!body) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })

  const displayName = String(body.displayName || '').trim()
  const email = String(body.email || '').trim().toLowerCase()
  const temporaryPassword = String(body.temporaryPassword || '')

  if (displayName.length < 2 || displayName.length > 120) {
    return NextResponse.json({ error: 'Student name must be between 2 and 120 characters.' }, { status: 400 })
  }
  if (!email || !email.includes('@') || email.length > 320) {
    return NextResponse.json({ error: 'Enter a valid student email address.' }, { status: 400 })
  }
  if (temporaryPassword.length < 8 || temporaryPassword.length > 128) {
    return NextResponse.json({ error: 'Temporary password must be between 8 and 128 characters.' }, { status: 400 })
  }

  const publicClient = createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  )

  const redirectTo = `${publicOrigin(request)}/login?verified=1`
  const { data: signup, error: signupError } = await publicClient.auth.signUp({
    email,
    password: temporaryPassword,
    options: {
      emailRedirectTo: redirectTo,
      data: { display_name: displayName },
    },
  })

  if (signupError || !signup.user) {
    const message = signupError?.message || 'Student account could not be created.'
    const status = /already|registered|exists/i.test(message) ? 409 : 400
    return NextResponse.json({ error: message }, { status })
  }

  if (Array.isArray(signup.user.identities) && signup.user.identities.length === 0) {
    return NextResponse.json({ error: 'A student account already exists for this email address.' }, { status: 409 })
  }

  const { error: profileError } = await adminSupabase
    .from('profiles')
    .update({
      email,
      display_name: displayName,
      role: 'student',
      provisioned: true,
    })
    .eq('id', signup.user.id)

  if (profileError) {
    return NextResponse.json(
      { error: 'Student account was created, but portal access could not be provisioned. Contact the administrator.' },
      { status: 500 },
    )
  }

  return NextResponse.json({
    ok: true,
    student: { id: signup.user.id, email, displayName },
    verificationSent: true,
    createdBy: user.id,
  }, { status: 201 })
}
