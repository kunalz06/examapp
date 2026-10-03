import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { requireStudent } from '@/lib/auth'
import { ExamRunner } from '@/components/ExamRunner'
import type { Question } from '@/lib/types'

export const metadata: Metadata = { title: 'Exam in progress' }
export const dynamic = 'force-dynamic'

const RECOVERY_GRACE_MS = 2 * 60 * 1000

export default async function AttemptPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params
  const { supabase, user } = await requireStudent()

  let { data: attempt } = await supabase
    .from('exam_attempts')
    .select('id,exam_id,user_id,status,expires_at,violation_count')
    .eq('id', attemptId)
    .eq('user_id', user.id)
    .single()

  if (!attempt) notFound()

  const recoveryDeadline = new Date(attempt.expires_at).getTime() + RECOVERY_GRACE_MS
  if (attempt.status === 'in_progress' && Date.now() > recoveryDeadline) {
    await supabase.rpc('submit_attempt', { p_attempt_id: attempt.id })
    const { data: refreshed } = await supabase
      .from('exam_attempts')
      .select('id,exam_id,user_id,status,expires_at,violation_count')
      .eq('id', attemptId)
      .eq('user_id', user.id)
      .single()
    attempt = refreshed ?? attempt
  }

  if (attempt.status !== 'in_progress') redirect(`/attempt/${attempt.id}/result`)

  const [{ data: exam }, { data: questions }, { data: answers }] = await Promise.all([
    supabase.from('exams').select('id,title,duration_minutes').eq('id', attempt.exam_id).single(),
    supabase
      .from('questions')
      .select('id,prompt,type,points,position,question_options(id,label,position)')
      .eq('exam_id', attempt.exam_id)
      .order('position'),
    supabase.from('answers').select('question_id,selected_option_id,text_answer').eq('attempt_id', attempt.id),
  ])

  if (!exam || !questions) notFound()

  const normalized = questions.map((question) => ({
    ...question,
    points: Number(question.points),
    question_options: [...(question.question_options || [])].sort((a, b) => a.position - b.position),
  })) as Question[]

  return (
    <main className="exam-page">
      <div className="container exam-container">
        <ExamRunner
          attemptId={attempt.id}
          examTitle={exam.title}
          expiresAt={attempt.expires_at}
          initialViolationCount={attempt.violation_count}
          questions={normalized}
          initialAnswers={answers || []}
        />
      </div>
    </main>
  )
}
