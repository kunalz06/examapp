import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { requireStudent } from '@/lib/auth'

export const metadata: Metadata = { title: 'Exam result' }
export const dynamic = 'force-dynamic'

type GradeItem = {
  questionId: string
  prompt: string
  type: 'single_choice' | 'short_text'
  points: number
  selectedLabel: string | null
  textAnswer: string | null
  score: number | null
  feedback: string | null
  gradedAt: string | null
}

type GradePayload = {
  attemptId: string
  status: 'in_progress' | 'submitted' | 'disqualified' | 'graded'
  autoScore: number
  manualScore: number
  maxScore: number
  submittedAt: string | null
  requiresManualGrading: boolean
  items: GradeItem[]
}

export default async function ResultPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params
  const { supabase, user } = await requireStudent()

  const { data: attempt } = await supabase
    .from('exam_attempts')
    .select('id,exam_id,status,started_at,submitted_at,disqualified_at,violation_count,face_violation_count')
    .eq('id', attemptId)
    .eq('user_id', user.id)
    .single()

  if (!attempt) notFound()
  if (attempt.status === 'in_progress') redirect(`/attempt/${attempt.id}`)

  const [{ data: exam }, { data: gradeRaw }] = await Promise.all([
    supabase.from('exams').select('title').eq('id', attempt.exam_id).single(),
    supabase.rpc('get_attempt_grade', { p_attempt_id: attempt.id }),
  ])

  const grade = gradeRaw as unknown as GradePayload | null
  const totalScore = grade ? Number(grade.autoScore) + Number(grade.manualScore) : 0
  const totalPossible = grade ? Number(grade.maxScore) : 0
  const percentage = totalPossible > 0 ? Math.round((totalScore / totalPossible) * 1000) / 10 : 0

  return (
    <main>
      <div className="container narrow">
        <div className="card result-card">
          <span className={attempt.status === 'disqualified' ? 'badge red' : 'badge'}>{attempt.status}</span>
          <h1 className="page-title">{exam?.title || 'Exam result'}</h1>

          {attempt.status === 'disqualified' ? (
            <div className="alert">
              <strong>Attempt disqualified.</strong> The configured proctoring limit was reached. This attempt recorded {attempt.violation_count} tab violation{attempt.violation_count === 1 ? '' : 's'} and {attempt.face_violation_count} face-monitor warning{attempt.face_violation_count === 1 ? '' : 's'}.
            </div>
          ) : attempt.status === 'submitted' ? (
            <div className="notice section">
              <strong>Submitted successfully.</strong> Written responses are awaiting marking. Your final grade will appear here automatically when grading is complete.
            </div>
          ) : (
            <>
              <div className="grid grid-4 section">
                <div className="stat"><b>{totalScore}</b><span className="small muted">score / {totalPossible}</span></div>
                <div className="stat"><b>{percentage}%</b><span className="small muted">final grade</span></div>
                <div className="stat"><b>{attempt.violation_count}</b><span className="small muted">tab violations</span></div>
                <div className="stat"><b>{attempt.face_violation_count}</b><span className="small muted">face warnings</span></div>
              </div>
              <div className="success section">Grading is complete and released.</div>

              <section className="section stack">
                <div>
                  <div className="eyebrow">Grade breakdown</div>
                  <h2 className="section-heading">Your marks</h2>
                </div>
                {(grade?.items || []).map((item, index) => (
                  <article className="card review-question" key={item.questionId}>
                    <div className="actions question-meta">
                      <span className="badge">Question {index + 1}</span>
                      <span className="small muted">{Number(item.score || 0)} / {Number(item.points)} points</span>
                    </div>
                    <h3>{item.prompt}</h3>
                    {item.type === 'single_choice' ? (
                      <div className="response-box">
                        <span className="field-hint">Your answer</span>
                        <p>{item.selectedLabel || 'No answer submitted.'}</p>
                      </div>
                    ) : (
                      <>
                        <div className="response-box">
                          <span className="field-hint">Your response</span>
                          <p>{item.textAnswer || 'No answer submitted.'}</p>
                        </div>
                        <div className="response-box">
                          <span className="field-hint">Marker feedback</span>
                          <p>{item.feedback || 'No written feedback was provided.'}</p>
                        </div>
                      </>
                    )}
                  </article>
                ))}
              </section>
            </>
          )}

          <div className="actions section">
            <Link className="btn btn-primary" href="/dashboard">Back to my exams</Link>
          </div>
        </div>
      </div>
    </main>
  )
}
