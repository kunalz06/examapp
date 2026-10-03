import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(_request: Request, { params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: attempt } = await supabase
    .from('exam_attempts')
    .select('status,violation_count,expires_at')
    .eq('id', attemptId)
    .eq('user_id', user.id)
    .single()

  if (!attempt) return NextResponse.json({ error: 'Attempt not found' }, { status: 404 })
  return NextResponse.json({ status: attempt.status, violationCount: attempt.violation_count, expiresAt: attempt.expires_at })
}
