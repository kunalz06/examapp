import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/auth'
import { gradeAnswer } from '@/app/admin/actions'

export const metadata: Metadata = { title: 'Review attempt' }
export const dynamic = 'force-dynamic'

export default async function ReviewAttemptPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params
  const { supabase } = await requireAdmin()

  const { data: attempt } = await supabase
    .from('exam_attempts')
    .select('id,exam_id,user_id,status,started_at,submitted_at,violation_count,auto_score,manual_score,max_score')
    .eq('id', attemptId)
    .single()

  if (!attempt) notFound()

  const [{ data: exam }, { data: candidate }, { data: questions }, { data: answers }, { data: events }, { data: keys }] = await Promise.all([
    supabase.from('exams').select('title').eq('id', attempt.exam_id).single(),
    supabase.from('profiles').select('display_name,email').eq('id', attempt.user_id).single(),
    supabase.from('questions').select('id,prompt,type,points,position,question_options(id,label,position)').eq('exam_id', attempt.exam_id).order('position'),
    supabase.from('answers').select('id,question_id,selected_option_id,text_answer,manual_score,grader_feedback,graded_at').eq('attempt_id', attempt.id),
    supabase.from('proctor_events').select('id,event_type,occurred_at,details').eq('attempt_id', attempt.id).order('occurred_at'),
    supabase.from('question_answer_keys').select('question_id,correct_option_id'),
  ])

  const answerMap = new Map((answers || []).map((answer) => [answer.question_id, answer]))
  const keyMap = new Map((keys || []).map((key) => [key.question_id, key.correct_option_id]))
  const totalScore = Number(attempt.auto_score) + Number(attempt.manual_score)
  const manualQuestions = (questions || []).filter((question) => question.type === 'short_text')
  const markedCount = manualQuestions.filter((question) => answerMap.get(question.id)?.manual_score !== null && answerMap.get(question.id)?.manual_score !== undefined).length
  const canGrade = attempt.status === 'submitted' || attempt.status === 'graded'

  return (
    <main>
      <div className="container admin-content">
        <div className="page-head">
          <div>
            <div className="eyebrow">Attempt review</div>
            <h1 className="page-title">{exam?.title || 'Exam'}</h1>
            <p className="muted">{candidate?.display_name || candidate?.email || 'Student'}</p>
          </div>
          <div className="actions">
            <span className={attempt.status === 'disqualified' ? 'badge red' : 'badge'}>{attempt.status}</span>
            <Link className="btn btn-secondary" href="/admin/submissions">All submissions</Link>
          </div>
        </div>

        <div className="grid grid-4">
          <div className="stat"><b>{totalScore}</b><span className="small muted">score / {Number(attempt.max_score)}</span></div>
          <div className="stat"><b>{attempt.violation_count}</b><span className="small muted">tab violations</span></div>
          <div className="stat"><b>{markedCount} / {manualQuestions.length}</b><span className="small muted">written answers marked</span></div>
          <div className="stat"><b>{events?.length || 0}</b><span className="small muted">proctor events</span></div>
        </div>

        {!canGrade && attempt.status === 'in_progress' && (
          <div className="notice section">This attempt is still in progress. Marking becomes available after submission.</div>
        )}
        {attempt.status === 'graded' && (
          <div className="success section">All written answers are marked. The final grade is visible to the student.</div>
        )}

        <section className="section stack">
          <div className="section-title-row">
            <div>
              <div className="eyebrow">Marking</div>
              <h2 className="section-heading">Answers</h2>
            </div>
          </div>

          {(questions || []).map((question, index) => {
            const answer = answerMap.get(question.id)
            const options = [...(question.question_options || [])].sort((a, b) => a.position - b.position)
            const selected = options.find((option) => option.id === answer?.selected_option_id)
            const correctId = keyMap.get(question.id)
            const correct = options.find((option) => option.id === correctId)

            return (
              <article className="card review-question" key={question.id}>
                <div className="actions question-meta">
                  <span className="badge">Question {index + 1}</span>
                  <span className="small muted">{Number(question.points)} points</span>
                </div>
                <h3>{question.prompt}</h3>

                {question.type === 'single_choice' ? (
                  <div className="review-answer-grid">
                    <div><span className="field-hint">Student answer</span><strong>{selected?.label || 'No answer'}</strong></div>
                    <div><span className="field-hint">Correct answer</span><strong>{correct?.label || 'Not configured'}</strong></div>
                    <span className={selected && selected.id === correctId ? 'badge' : 'badge red'}>
                      {selected && selected.id === correctId ? 'Correct' : 'Incorrect'}
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="response-box">
                      <span className="field-hint">Written response</span>
                      <p>{answer?.text_answer || 'No answer submitted.'}</p>
                    </div>
                    {canGrade ? (
                      <form className="form marking-form" action={gradeAnswer}>
                        <input type="hidden" name="attemptId" value={attempt.id} />
                        <input type="hidden" name="questionId" value={question.id} />
                        <div className="grid grid-2">
                          <div className="field">
                            <label>Score (0–{Number(question.points)})</label>
                            <input
                              className="input"
                              name="score"
                              type="number"
                              min={0}
                              max={Number(question.points)}
                              step="0.5"
                              defaultValue={answer?.manual_score ?? ''}
                              required
                            />
                          </div>
                          <div className="field">
                            <label>Feedback</label>
                            <input className="input" name="feedback" maxLength={5000} defaultValue={answer?.grader_feedback || ''} />
                          </div>
                        </div>
                        <button className="btn btn-primary">{answer?.manual_score === null || answer?.manual_score === undefined ? 'Save mark' : 'Update mark'}</button>
                      </form>
                    ) : (
                      <div className="muted small">Marking is unavailable until this attempt has been submitted.</div>
                    )}
                  </>
                )}
              </article>
            )
          })}
        </section>

        <section className="section">
          <div className="section-title-row">
            <div>
              <div className="eyebrow">Audit</div>
              <h2 className="section-heading">Proctoring events</h2>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Time</th><th>Event</th><th>Details</th></tr></thead>
              <tbody>
                {(events || []).map((event) => (
                  <tr key={event.id}>
                    <td>{new Date(event.occurred_at).toLocaleString('en-IN')}</td>
                    <td>{event.event_type.replaceAll('_', ' ')}</td>
                    <td><code className="event-code">{JSON.stringify(event.details)}</code></td>
                  </tr>
                ))}
                {!events?.length && <tr><td colSpan={3} className="muted">No proctoring events recorded.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  )
}
