import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null) as { examId?: string } | null
  if (!body?.examId) return NextResponse.json({ error: 'examId is required' }, { status: 400 })

  const { data, error } = await supabase
    .from('exam_attempts')
    .insert({ exam_id: body.examId, user_id: user.id, expires_at: new Date().toISOString() })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ attemptId: data.id })
}
