import type { Metadata } from 'next'
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
    .select('id,exam_id,user_id,status,started_at,submitted_at,violation_count,auto_score,manual_score')
    .eq('id', attemptId)
    .single()
  if (!attempt) notFound()

  const [{ data: exam }, { data: candidate }, { data: questions }, { data: answers }, { data: events }, { data: keys }] = await Promise.all([
    supabase.from('exams').select('title').eq('id', attempt.exam_id).single(),
    supabase.from('profiles').select('display_name').eq('id', attempt.user_id).single(),
    supabase.from('questions').select('id,prompt,type,points,position,question_options(id,label,position)').eq('exam_id', attempt.exam_id).order('position'),
    supabase.from('answers').select('id,question_id,selected_option_id,text_answer,manual_score,grader_feedback,graded_at').eq('attempt_id', attempt.id),
    supabase.from('proctor_events').select('id,event_type,occurred_at,details').eq('attempt_id', attempt.id).order('occurred_at'),
    supabase.from('question_answer_keys').select('question_id,correct_option_id'),
  ])

  const answerMap = new Map((answers || []).map((a) => [a.question_id, a]))
  const keyMap = new Map((keys || []).map((k) => [k.question_id, k.correct_option_id]))

  return (
    <main>
      <div className="container">
        <div className="page-head">
          <div>
            <div className="eyebrow">Attempt review</div>
            <h2 style={{ marginTop: 8 }}>{exam?.title || 'Exam'}</h2>
            <p className="muted">Candidate: {candidate?.display_name || attempt.user_id}</p>
          </div>
          <span className={attempt.status === 'disqualified' ? 'badge red' : 'badge'}>{attempt.status}</span>
        </div>

        <div className="grid grid-3">
          <div className="stat"><b>{Number(attempt.auto_score) + Number(attempt.manual_score)}</b><span className="small muted">current score</span></div>
          <div className="stat"><b>{attempt.violation_count}</b><span className="small muted">tab violations</span></div>
          <div className="stat"><b>{events?.length || 0}</b><span className="small muted">proctor events</span></div>
        </div>

        <section className="section stack">
          <h3>Answers and marking</h3>
          {(questions || []).map((question, index) => {
            const answer = answerMap.get(question.id)
            const options = [...(question.question_options || [])].sort((a, b) => a.position - b.position)
            const selected = options.find((o) => o.id === answer?.selected_option_id)
            const correctId = keyMap.get(question.id)
            const correct = options.find((o) => o.id === correctId)
            return (
              <article className="card" key={question.id}>
                <div className="actions" style={{ justifyContent: 'space-between' }}><span className="badge">Question {index + 1}</span><span className="small muted">{Number(question.points)} pts</span></div>
                <h3 style={{ marginTop: 16 }}>{question.prompt}</h3>
                {question.type === 'single_choice' ? (
                  <div className="stack">
                    <p><strong>Selected:</strong> {selected?.label || 'No answer'}</p>
                    <p><strong>Correct:</strong> {correct?.label || 'Not configured'}</p>
                    <span className={selected && selected.id === correctId ? 'badge' : 'badge red'}>{selected && selected.id === correctId ? 'Correct' : 'Incorrect'}</span>
                  </div>
                ) : (
                  <>
                    <div className="notice"><strong>Written response</strong><p style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>{answer?.text_answer || 'No answer submitted.'}</p></div>
                    <form className="form section" action={gradeAnswer}>
                      <input type="hidden" name="attemptId" value={attempt.id} />
                      <input type="hidden" name="questionId" value={question.id} />
                      <div className="field"><label>Score (0–{Number(question.points)})</label><input className="input" name="score" type="number" min={0} max={Number(question.points)} step="0.5" defaultValue={answer?.manual_score ?? 0} required /></div>
                      <div className="field"><label>Feedback</label><textarea className="textarea" name="feedback" defaultValue={answer?.grader_feedback || ''} /></div>
                      <button className="btn btn-primary">Save mark</button>
                    </form>
                  </>
                )}
              </article>
            )
          })}
        </section>

        <section className="section">
          <h3>Proctoring event log</h3>
          <div className="table-wrap"><table><thead><tr><th>Time</th><th>Event</th><th>Details</th></tr></thead><tbody>
            {(events || []).map((event) => <tr key={event.id}><td>{new Date(event.occurred_at).toLocaleString()}</td><td>{event.event_type}</td><td><code>{JSON.stringify(event.details)}</code></td></tr>)}
            {!events?.length && <tr><td colSpan={3} className="muted">No proctor events recorded.</td></tr>}
          </tbody></table></div>
        </section>
      </div>
    </main>
  )
}
