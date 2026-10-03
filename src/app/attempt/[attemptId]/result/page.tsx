import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { requireUser } from '@/lib/auth'

export const metadata: Metadata = { title: 'Exam result' }
export const dynamic = 'force-dynamic'

export default async function ResultPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params
  const { supabase, user } = await requireUser()

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
  const hasWritten = attempt.requires_manual_grading
  const totalScore = Number(attempt.auto_score) + Number(attempt.manual_score)

  return (
    <main>
      <div className="container" style={{ maxWidth: 820 }}>
        <div className="card">
          <span className={attempt.status === 'disqualified' ? 'badge red' : 'badge'}>{attempt.status}</span>
          <h2 style={{ marginTop: 14 }}>{exam?.title || 'Exam result'}</h2>

          {attempt.status === 'disqualified' ? (
            <div className="alert">
              <strong>Attempt disqualified.</strong> The server recorded {attempt.violation_count} tab-switch violation{attempt.violation_count === 1 ? '' : 's'}. Under the exam rules, the third confirmed violation disqualifies the attempt.
            </div>
          ) : (
            <>
              <div className="grid grid-3 section">
                <div className="stat"><b>{totalScore}</b><span className="small muted">current score</span></div>
                <div className="stat"><b>{totalPossible}</b><span className="small muted">maximum points</span></div>
                <div className="stat"><b>{attempt.violation_count}</b><span className="small muted">tab violations</span></div>
              </div>
              {attempt.status === 'submitted' && hasWritten && (
                <div className="notice section">Written answers are awaiting administrator grading. Your displayed score can increase after marking.</div>
              )}
              {attempt.status === 'graded' && <div className="notice section">All written responses have been graded.</div>}
            </>
          )}

          <div className="actions section"><Link className="btn btn-primary" href="/dashboard">Back to dashboard</Link></div>
        </div>
      </div>
    </main>
  )
}
