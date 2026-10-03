import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request, { params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null) as { questionId?: string; selectedOptionId?: string; text?: string } | null
  if (!body?.questionId) return NextResponse.json({ error: 'questionId is required' }, { status: 400 })

  const { data: attempt } = await supabase
    .from('exam_attempts')
    .select('id,status')
    .eq('id', attemptId)
    .eq('user_id', user.id)
    .single()
  if (!attempt || attempt.status !== 'in_progress') return NextResponse.json({ error: 'Attempt is not active' }, { status: 409 })

  const { error } = await supabase.from('answers').upsert({
    attempt_id: attemptId,
    question_id: body.questionId,
    selected_option_id: body.selectedOptionId || null,
    text_answer: typeof body.text === 'string' ? body.text.slice(0, 20000) : null,
  }, { onConflict: 'attempt_id,question_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ saved: true })
}
