import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request, { params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null) as {
    questionId?: string
    selectedOptionId?: string | null
    text?: string | null
  } | null

  if (!body?.questionId) {
    return NextResponse.json({ error: 'questionId is required' }, { status: 400 })
  }

  const { data, error } = await supabase.rpc('save_attempt_answer', {
    p_attempt_id: attemptId,
    p_question_id: body.questionId,
    p_selected_option_id: body.selectedOptionId || null,
    p_text_answer: typeof body.text === 'string' ? body.text.slice(0, 20000) : null,
  })

  if (error) {
    const conflict = /not active|window is closed/i.test(error.message)
    return NextResponse.json({ error: error.message }, { status: conflict ? 409 : 400 })
  }

  return NextResponse.json({ saved: true, savedAt: data.updated_at })
}
