import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { Json } from '@/lib/database.types'

type FinalAnswer = {
  questionId?: string
  selectedOptionId?: string | null
  text?: string | null
}

export async function POST(request: Request, { params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({ answers: [] })) as { answers?: FinalAnswer[] }
  const answers = Array.isArray(body.answers) ? body.answers.slice(0, 500) : []

  if (answers.some((answer) => !answer?.questionId)) {
    return NextResponse.json({ error: 'Invalid answer payload' }, { status: 400 })
  }

  const { data, error } = await supabase.rpc('finalize_attempt', {
    p_attempt_id: attemptId,
    p_answers: answers as unknown as Json,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({
    submitted: data.status !== 'in_progress',
    status: data.status,
    submittedAt: data.submitted_at,
  })
}
