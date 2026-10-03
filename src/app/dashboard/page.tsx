import Link from 'next/link'
import type { Metadata } from 'next'
import { requireStudent } from '@/lib/auth'

export const metadata: Metadata = { title: 'My exams' }

export default async function DashboardPage() {
  const { supabase, user, profile } = await requireStudent()

  const [{ data: exams }, { data: attempts }] = await Promise.all([
    supabase.from('exams').select('id,title,description,duration_minutes,starts_at,ends_at,status').eq('status', 'published').order('created_at', { ascending: false }),
    supabase.from('exam_attempts').select('id,exam_id,status,started_at,expires_at,violation_count,auto_score,manual_score,max_score').eq('user_id', user.id).order('started_at', { ascending: false }),
  ])

  const attemptByExam = new Map((attempts || []).map((attempt) => [attempt.exam_id, attempt]))
  const completedCount = (attempts || []).filter((attempt) => attempt.status !== 'in_progress').length
  const activeCount = (attempts || []).filter((attempt) => attempt.status === 'in_progress').length
  const now = Date.now()

  return (
    <main>
      <div className="container">
        <div className="page-head portal-dashboard-head">
          <div>
            <div className="eyebrow">Student dashboard</div>
            <h1 className="page-title">Welcome, {profile.display_name || user.email}</h1>
            <p className="muted">Your examinations, submissions, and released grades.</p>
          </div>
          <Link className="btn btn-secondary" href="/account/password">Change password</Link>
        </div>

        <div className="grid grid-3 dashboard-stats">
          <div className="stat"><b>{exams?.length || 0}</b><span className="small muted">published exams</span></div>
          <div className="stat"><b>{activeCount}</b><span className="small muted">active attempts</span></div>
          <div className="stat"><b>{completedCount}</b><span className="small muted">completed attempts</span></div>
        </div>

        <section className="section">
          <div className="section-title-row"><div><div className="eyebrow">Available</div><h2 className="section-heading">Examinations</h2></div></div>
          <div className="grid grid-2 exam-card-grid">
            {(exams || []).map((exam) => {
              const attempt = attemptByExam.get(exam.id)
              const startsAt = exam.starts_at ? new Date(exam.starts_at).getTime() : null
              const endsAt = exam.ends_at ? new Date(exam.ends_at).getTime() : null
              const upcoming = startsAt !== null && now < startsAt
              const closed = endsAt !== null && now >= endsAt
              return (
                <article className="card exam-card" key={exam.id}>
                  <div className="actions exam-card-meta">
                    <span className="badge">{exam.duration_minutes} min</span>
                    {attempt && <span className={attempt.status === 'disqualified' ? 'badge red' : 'badge black'}>{attempt.status}</span>}
                    {!attempt && upcoming && <span className="badge black">Scheduled</span>}
                    {!attempt && closed && <span className="badge red">Closed</span>}
                  </div>
                  <h3>{exam.title}</h3>
                  {exam.description && <p className="muted">{exam.description}</p>}
                  {(exam.starts_at || exam.ends_at) && (
                    <dl className="exam-window">
                      {exam.starts_at && <div><dt>Starts</dt><dd>{new Date(exam.starts_at).toLocaleString('en-IN')}</dd></div>}
                      {exam.ends_at && <div><dt>Ends</dt><dd>{new Date(exam.ends_at).toLocaleString('en-IN')}</dd></div>}
                    </dl>
                  )}
                  <div className="actions exam-card-actions">
                    {!attempt && !upcoming && !closed && <Link className="btn btn-primary" href={`/exam/${exam.id}`}>Open exam</Link>}
                    {attempt?.status === 'in_progress' && <Link className="btn btn-primary" href={`/attempt/${attempt.id}`}>Resume attempt</Link>}
                    {attempt && attempt.status !== 'in_progress' && <Link className="btn btn-secondary" href={`/attempt/${attempt.id}/result`}>{attempt.status === 'graded' ? 'View grade' : 'View submission'}</Link>}
                  </div>
                </article>
              )
            })}
            {!exams?.length && <div className="empty-state"><h3>No exams available</h3><p className="muted">Published examinations will appear here.</p></div>}
          </div>
        </section>

        <section className="section">
          <div className="section-title-row"><div><div className="eyebrow">History</div><h2 className="section-heading">Attempts</h2></div></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Started</th><th>Status</th><th>Violations</th><th>Grade</th><th></th></tr></thead>
              <tbody>
                {(attempts || []).map((attempt) => {
                  const score = Number(attempt.auto_score) + Number(attempt.manual_score)
                  return (
                    <tr key={attempt.id}>
                      <td>{new Date(attempt.started_at).toLocaleString('en-IN')}</td>
                      <td><span className={attempt.status === 'disqualified' ? 'badge red' : 'badge'}>{attempt.status}</span></td>
                      <td>{attempt.violation_count}</td>
                      <td>{attempt.status === 'graded' ? `${score} / ${Number(attempt.max_score)}` : attempt.status === 'submitted' ? 'Pending marking' : '—'}</td>
                      <td><Link className="table-link" href={attempt.status === 'in_progress' ? `/attempt/${attempt.id}` : `/attempt/${attempt.id}/result`}>Open</Link></td>
                    </tr>
                  )
                })}
                {!attempts?.length && <tr><td colSpan={5} className="muted">No attempts yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  )
}
