import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const PRODUCTION_ORIGIN = 'https://examapp-seven.vercel.app'

export async function POST(_request: Request, { params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })

  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) return NextResponse.json({ error: 'Session expired.' }, { status: 401 })

  const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/admin-send-password-reset`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ studentId, redirectOrigin: PRODUCTION_ORIGIN }),
  })

  const payload = await response.json().catch(() => ({ error: 'Password reset service returned an invalid response.' }))
  return NextResponse.json(payload, { status: response.status })
}
