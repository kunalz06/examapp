import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/auth'
import { ExamEditor, type EditableQuestion } from '@/components/ExamEditor'

export const metadata: Metadata = { title: 'Edit exam and questions' }
export const dynamic = 'force-dynamic'

export default async function EditExamPage({ params }: { params: Promise<{ examId: string }> }) {
  const { examId } = await params
  const { supabase } = await requireAdmin()

  const [{ data: exam, error: examError }, { count: attemptCount, error: attemptsError }] = await Promise.all([
    supabase.from('exams')
      .select('id,title,description,duration_minutes,starts_at,ends_at,updated_at,status')
      .eq('id', examId).maybeSingle(),
    supabase.from('exam_attempts').select('id', { count: 'exact', head: true }).eq('exam_id', examId),
  ])
  if (examError) throw new Error(examError.message)
  if (!exam) notFound()
  if (attemptsError) throw new Error(attemptsError.message)

  // Answer keys are fetched only in this server-rendered admin route.
  // No student's API response includes them.
  const { data: questions, error: questionsError } = await supabase
    .from('questions')
    .select('id,prompt,type,points,position,question_options(id,label,position)')
    .eq('exam_id', examId)
    .order('position')

  if (questionsError) throw new Error(questionsError.message)
  const ids = (questions || []).map((q) => q.id)
  const [{ data: keys, error: keysError }, { data: guidance, error: guidanceError }] = await Promise.all([
    ids.length
      ? supabase.from('question_answer_keys').select('question_id,correct_option_id').in('question_id', ids)
      : Promise.resolve({ data: [] as { question_id: string; correct_option_id: string }[], error: null }),
    supabase.rpc('admin_get_question_guidance', { p_exam_id: examId }),
  ])
  if (keysError) throw new Error(keysError.message)
  if (guidanceError) throw new Error(guidanceError.message)

  const correct = new Map((keys || []).map((key) => [key.question_id, key.correct_option_id]))
  const guideMap = new Map((guidance || []).map((item) => [item.question_id, item.guidance]))

  const initialQuestions: EditableQuestion[] = (questions || [])
    .map((q) => ({
      id: q.id,
      prompt: q.prompt,
      type: q.type,
      points: Number(q.points),
      guidance: guideMap.get(q.id) || '',
      options: (q.question_options || [])
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((o) => ({ id: o.id, label: o.label, is_correct: o.id === correct.get(q.id) })),
    }))

  return (
    <main>
      <div className="container narrow-wide admin-content">
        <div className="page-head">
          <div>
            <div className="eyebrow">Exam management · {exam.status}</div>
            <h1 className="page-title">Edit exam</h1>
            <p className="muted">{exam.title}</p>
          </div>
          <div className="actions">
            <Link className="btn btn-secondary" href={'/admin/exams/' + exam.id + '/schedule'}>Students & slots</Link>
            <Link className="btn btn-secondary" href="/admin">Back to Admin</Link>
          </div>
        </div>

        {(attemptCount || 0) > 0 ? (
          <div className="notice section">
            This exam has {attemptCount} student attempt{attemptCount === 1 ? '' : 's'}.
            To keep submitted answers, marks and the question paper consistent, editing is locked after
            the first attempt. Create a new exam for a revised version.
          </div>
        ) : (
          <>
            {exam.status === 'published' && (
              <div className="notice section">
                This exam is published. Edits will affect students who have not started their attempt.
                Consider moving it to Draft before making major changes.
              </div>
            )}
            <ExamEditor exam={exam} initialQuestions={initialQuestions} />
          </>
        )}
      </div>
    </main>
  )
}
