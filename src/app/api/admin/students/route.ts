import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
  }

  const body = await request.json().catch(() => null) as {
    displayName?: string
    email?: string
    temporaryPassword?: string
  } | null

  if (!body) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })

  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) return NextResponse.json({ error: 'Session expired.' }, { status: 401 })

  const functionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/admin-create-student`
  const response = await fetch(functionUrl, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      displayName: body.displayName,
      email: body.email,
      temporaryPassword: body.temporaryPassword,
      redirectOrigin: new URL(request.url).origin,
    }),
  })

  const payload = await response.json().catch(() => ({ error: 'Student account service returned an invalid response.' }))
  return NextResponse.json(payload, { status: response.status })
}
