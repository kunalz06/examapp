import type { Metadata } from 'next'
import Link from 'next/link'
import { requireAdmin } from '@/lib/auth'

export const metadata: Metadata = { title: 'All submissions' }
export const dynamic = 'force-dynamic'

export default async function SubmissionsPage() {
  const { supabase } = await requireAdmin()

  const [{ data: attempts }, { data: exams }, { data: students }] = await Promise.all([
    supabase
      .from('exam_attempts')
      .select('id,exam_id,user_id,status,started_at,submitted_at,violation_count,auto_score,manual_score,max_score')
      .in('status', ['submitted', 'graded', 'disqualified'])
      .order('started_at', { ascending: false }),
    supabase.from('exams').select('id,title'),
    supabase.from('profiles').select('id,display_name,email').eq('role', 'student'),
  ])

  const examMap = new Map((exams || []).map((exam) => [exam.id, exam.title]))
  const studentMap = new Map((students || []).map((student) => [student.id, student.display_name || student.email || 'Student']))
  const pending = (attempts || []).filter((attempt) => attempt.status === 'submitted').length
  const graded = (attempts || []).filter((attempt) => attempt.status === 'graded').length
  const disqualified = (attempts || []).filter((attempt) => attempt.status === 'disqualified').length

  return (
    <main>
      <div className="container admin-content">
        <div className="page-head">
          <div>
            <div className="eyebrow">Submissions</div>
            <h1 className="page-title">All exam submissions</h1>
            <p className="muted">Review every completed attempt and mark written responses.</p>
          </div>
          <Link className="btn btn-secondary" href="/admin">Back to overview</Link>
        </div>

        <div className="grid grid-4">
          <div className="stat"><b>{attempts?.length || 0}</b><span className="small muted">total submissions</span></div>
          <div className="stat"><b>{pending}</b><span className="small muted">awaiting marking</span></div>
          <div className="stat"><b>{graded}</b><span className="small muted">graded</span></div>
          <div className="stat"><b>{disqualified}</b><span className="small muted">disqualified</span></div>
        </div>

        <section className="section">
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Student</th><th>Exam</th><th>Submitted</th><th>Status</th><th>Violations</th><th>Grade</th><th></th></tr>
              </thead>
              <tbody>
                {(attempts || []).map((attempt) => {
                  const score = Number(attempt.auto_score) + Number(attempt.manual_score)
                  return (
                    <tr key={attempt.id}>
                      <td><strong>{studentMap.get(attempt.user_id) || 'Student'}</strong></td>
                      <td>{examMap.get(attempt.exam_id) || 'Exam'}</td>
                      <td>{new Date(attempt.submitted_at || attempt.started_at).toLocaleString('en-IN')}</td>
                      <td><span className={attempt.status === 'disqualified' ? 'badge red' : 'badge'}>{attempt.status}</span></td>
                      <td>{attempt.violation_count}</td>
                      <td>{attempt.status === 'graded' ? `${score} / ${Number(attempt.max_score)}` : attempt.status === 'submitted' ? 'Pending' : '—'}</td>
                      <td><Link className="table-link" href={`/admin/attempts/${attempt.id}`}>Review & mark</Link></td>
                    </tr>
                  )
                })}
                {!attempts?.length && <tr><td colSpan={7} className="muted">No submissions yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  )
}
