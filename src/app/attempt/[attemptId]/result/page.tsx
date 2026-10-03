import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { requireStudent } from '@/lib/auth'

export const metadata: Metadata = { title: 'Exam result' }
export const dynamic = 'force-dynamic'

export default async function ResultPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params
  const { supabase, user } = await requireStudent()

  const { data: attempt } = await supabase
    .from('exam_attempts')
    .select('id,exam_id,status,started_at,submitted_at,disqualified_at,violation_count,auto_score,manual_score,max_score,requires_manual_grading')
    .eq('id', attemptId)
    .eq('user_id', user.id)
    .single()

  if (!attempt) notFound()
  if (attempt.status === 'in_progress') redirect(`/attempt/${attempt.id}`)

  const { data: exam } = await supabase.from('exams').select('title').eq('id', attempt.exam_id).single()
  const totalPossible = Number(attempt.max_score)
  const totalScore = Number(attempt.auto_score) + Number(attempt.manual_score)

  return (
    <main>
      <div className="container narrow">
        <div className="card result-card">
          <span className={attempt.status === 'disqualified' ? 'badge red' : 'badge'}>{attempt.status}</span>
          <h1 className="page-title">{exam?.title || 'Exam result'}</h1>

          {attempt.status === 'disqualified' ? (
            <div className="alert">
              <strong>Attempt disqualified.</strong> Three tab-switch violations were confirmed for this attempt.
            </div>
          ) : (
            <>
              <div className="grid grid-3 section">
                <div className="stat"><b>{totalScore}</b><span className="small muted">current score</span></div>
                <div className="stat"><b>{totalPossible}</b><span className="small muted">maximum points</span></div>
                <div className="stat"><b>{attempt.violation_count}</b><span className="small muted">tab violations</span></div>
              </div>
              {attempt.status === 'submitted' && attempt.requires_manual_grading && (
                <div className="notice section">Written responses are awaiting grading. The score will update after marking.</div>
              )}
              {attempt.status === 'graded' && <div className="success section">Grading is complete.</div>}
            </>
          )}

          <div className="actions section"><Link className="btn btn-primary" href="/dashboard">Back to my exams</Link></div>
        </div>
      </div>
    </main>
  )
}
