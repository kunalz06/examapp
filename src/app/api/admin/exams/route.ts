import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = await request.json().catch(() => null)
  if (!payload || typeof payload.title !== 'string' || !Array.isArray(payload.questions) || payload.questions.length === 0) {
    return NextResponse.json({ error: 'Title and at least one question are required.' }, { status: 400 })
  }
  if (!Number.isInteger(payload.duration_minutes) || payload.duration_minutes < 1 || payload.duration_minutes > 600) {
    return NextResponse.json({ error: 'Duration must be between 1 and 600 minutes.' }, { status: 400 })
  }

  const { data, error } = await supabase.rpc('admin_create_exam', { p_payload: payload })
  if (error) return NextResponse.json({ error: error.message }, { status: error.code === '42501' ? 403 : 400 })
  return NextResponse.json({ examId: data })
}
