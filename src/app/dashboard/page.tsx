import Link from 'next/link'
import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth'

export const metadata: Metadata = { title: 'Dashboard' }

export default async function DashboardPage() {
  const { supabase, user } = await requireUser()

  const [{ data: profile }, { data: exams }, { data: attempts }] = await Promise.all([
    supabase.from('profiles').select('display_name, role').eq('id', user.id).single(),
    supabase.from('exams').select('id,title,description,duration_minutes,starts_at,ends_at,status').eq('status', 'published').order('created_at', { ascending: false }),
    supabase.from('exam_attempts').select('id,exam_id,status,started_at,expires_at,violation_count,auto_score,manual_score').eq('user_id', user.id).order('started_at', { ascending: false }),
  ])

  const attemptByExam = new Map((attempts || []).map((a) => [a.exam_id, a]))

  return (
    <main>
      <div className="container">
        <div className="page-head">
          <div>
            <div className="eyebrow">Student dashboard</div>
            <h2 style={{ marginTop: 8 }}>Welcome, {profile?.display_name || user.email}</h2>
            <p className="muted">Choose an available exam or review your previous attempt.</p>
          </div>
          {profile?.role === 'admin' && <Link className="btn btn-secondary" href="/admin">Open admin</Link>}
        </div>

        <section>
          <h3>Available exams</h3>
          <div className="grid grid-2">
            {(exams || []).map((exam) => {
              const attempt = attemptByExam.get(exam.id)
              return (
                <article className="card" key={exam.id}>
                  <div className="actions" style={{ justifyContent: 'space-between' }}>
                    <span className="badge">{exam.duration_minutes} min</span>
                    {attempt && <span className={attempt.status === 'disqualified' ? 'badge red' : 'badge black'}>{attempt.status}</span>}
                  </div>
                  <h3 style={{ marginTop: 18 }}>{exam.title}</h3>
                  <p className="muted">{exam.description || 'No description provided.'}</p>
                  <div className="actions">
                    {!attempt && <Link className="btn btn-primary" href={`/exam/${exam.id}`}>View requirements</Link>}
                    {attempt?.status === 'in_progress' && <Link className="btn btn-primary" href={`/attempt/${attempt.id}`}>Resume attempt</Link>}
                    {attempt && attempt.status !== 'in_progress' && <Link className="btn btn-secondary" href={`/attempt/${attempt.id}/result`}>View result</Link>}
                  </div>
                </article>
              )
            })}
            {!exams?.length && <div className="card"><p className="muted">No exams are currently published.</p></div>}
          </div>
        </section>

        <section className="section">
          <h3>Attempt history</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Started</th><th>Status</th><th>Violations</th><th>Score</th><th></th></tr></thead>
              <tbody>
                {(attempts || []).map((attempt) => (
                  <tr key={attempt.id}>
                    <td>{new Date(attempt.started_at).toLocaleString()}</td>
                    <td><span className={attempt.status === 'disqualified' ? 'badge red' : 'badge'}>{attempt.status}</span></td>
                    <td>{attempt.violation_count}</td>
                    <td>{Number(attempt.auto_score) + Number(attempt.manual_score)}</td>
                    <td><Link href={attempt.status === 'in_progress' ? `/attempt/${attempt.id}` : `/attempt/${attempt.id}/result`}>Open</Link></td>
                  </tr>
                ))}
                {!attempts?.length && <tr><td colSpan={5} className="muted">No attempts yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  )
}
