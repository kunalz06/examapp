import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const RECOVERY_GRACE_MS = 2 * 60 * 1000

export async function GET(_request: Request, { params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let { data: attempt } = await supabase
    .from('exam_attempts')
    .select('status,violation_count,expires_at')
    .eq('id', attemptId)
    .eq('user_id', user.id)
    .single()

  if (!attempt) return NextResponse.json({ error: 'Attempt not found' }, { status: 404 })

  const recoveryDeadline = new Date(attempt.expires_at).getTime() + RECOVERY_GRACE_MS
  if (attempt.status === 'in_progress' && Date.now() > recoveryDeadline) {
    const { error: submitError } = await supabase.rpc('submit_attempt', { p_attempt_id: attemptId })
    if (!submitError) {
      const { data: refreshed } = await supabase
        .from('exam_attempts')
        .select('status,violation_count,expires_at')
        .eq('id', attemptId)
        .eq('user_id', user.id)
        .single()
      attempt = refreshed ?? attempt
    }
  }

  return NextResponse.json({
    status: attempt.status,
    violationCount: attempt.violation_count,
    expiresAt: attempt.expires_at,
  })
}
