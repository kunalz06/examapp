import type { Metadata } from 'next'
import Link from 'next/link'
import { requireAdmin } from '@/lib/auth'
import { setExamStatus } from '@/app/admin/actions'

export const metadata: Metadata = { title: 'Admin' }
export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const { supabase } = await requireAdmin()
  const [{ data: profiles }, { data: exams }, { data: attempts }] = await Promise.all([
    supabase.from('profiles').select('id,display_name,role,created_at').order('created_at', { ascending: false }),
    supabase.from('exams').select('id,title,status,duration_minutes,created_at').order('created_at', { ascending: false }),
    supabase.from('exam_attempts').select('id,exam_id,user_id,status,started_at,violation_count,auto_score,manual_score').order('started_at', { ascending: false }).limit(100),
  ])

  const examMap = new Map((exams || []).map((exam) => [exam.id, exam.title]))
  const userMap = new Map((profiles || []).map((profile) => [profile.id, profile.display_name || 'Unnamed user']))
  const pending = (attempts || []).filter((a) => a.status === 'submitted').length

  return (
    <main>
      <div className="container">
        <div className="page-head">
          <div><div className="eyebrow">Administration</div><h2 style={{ marginTop: 8 }}>Exam control center</h2><p className="muted">Manage exams, candidates, attempts, proctoring status, and grading.</p></div>
          <Link className="btn btn-primary" href="/admin/exams/new">Create exam</Link>
        </div>

        <div className="grid grid-3">
          <div className="stat"><b>{profiles?.length || 0}</b><span className="small muted">users</span></div>
          <div className="stat"><b>{exams?.length || 0}</b><span className="small muted">exams</span></div>
          <div className="stat"><b>{pending}</b><span className="small muted">awaiting grading</span></div>
        </div>

        <section className="section">
          <div className="actions" style={{ justifyContent: 'space-between' }}><h3 style={{ margin: 0 }}>Exams</h3></div>
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table>
              <thead><tr><th>Exam</th><th>Duration</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>
                {(exams || []).map((exam) => (
                  <tr key={exam.id}>
                    <td><strong>{exam.title}</strong></td>
                    <td>{exam.duration_minutes} min</td>
                    <td><span className="badge">{exam.status}</span></td>
                    <td>
                      <form action={setExamStatus} className="actions">
                        <input type="hidden" name="examId" value={exam.id} />
                        <select className="select" name="status" defaultValue={exam.status} style={{ width: 140 }}>
                          <option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option>
                        </select>
                        <button className="btn btn-secondary">Update</button>
                      </form>
                    </td>
                  </tr>
                ))}
                {!exams?.length && <tr><td colSpan={4} className="muted">No exams yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="section">
          <h3>Recent exam takers</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Candidate</th><th>Exam</th><th>Status</th><th>Violations</th><th>Score</th><th></th></tr></thead>
              <tbody>
                {(attempts || []).map((attempt) => (
                  <tr key={attempt.id}>
                    <td>{userMap.get(attempt.user_id) || attempt.user_id}</td>
                    <td>{examMap.get(attempt.exam_id) || attempt.exam_id}</td>
                    <td><span className={attempt.status === 'disqualified' ? 'badge red' : 'badge'}>{attempt.status}</span></td>
                    <td>{attempt.violation_count}</td>
                    <td>{Number(attempt.auto_score) + Number(attempt.manual_score)}</td>
                    <td><Link href={`/admin/attempts/${attempt.id}`}>Review / mark</Link></td>
                  </tr>
                ))}
                {!attempts?.length && <tr><td colSpan={6} className="muted">No attempts yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="section">
          <h3>Users</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Role</th><th>Created</th></tr></thead>
              <tbody>{(profiles || []).map((p) => <tr key={p.id}><td>{p.display_name || p.id}</td><td>{p.role}</td><td>{new Date(p.created_at).toLocaleString()}</td></tr>)}</tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  )
}
