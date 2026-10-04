import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { LoginForm } from '@/components/LoginForm'
import { AdminStudentCreator } from '@/components/AdminStudentCreator'
import { AdminPasswordResetButton } from '@/components/AdminPasswordResetButton'
import { setExamStatus } from '@/app/admin/actions'

export const metadata: Metadata = { title: 'Admin' }
export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return (
      <main className="admin-auth-page">
        <div className="admin-auth-panel">
          <div className="admin-auth-brand"><span className="brand-mark" aria-hidden /><span>ExamCore Admin</span></div>
          <div className="auth-card">
            <div className="eyebrow">Restricted access</div>
            <h1 className="auth-title">Administrator sign in</h1>
            <p className="muted auth-copy">Authorized administrators only.</p>
            <LoginForm portal="admin" />
          </div>
        </div>
      </main>
    )
  }

  const { data: currentProfile } = await supabase.from('profiles').select('role,display_name').eq('id', user.id).maybeSingle()
  if (currentProfile?.role !== 'admin') redirect('/dashboard')

  const [{ data: profiles }, { data: exams }, { data: attempts }] = await Promise.all([
    supabase.from('profiles').select('id,email,display_name,role,provisioned,email_verified,created_at').eq('role', 'student').order('created_at', { ascending: false }),
    supabase.from('exams').select('id,title,status,duration_minutes,created_at').order('created_at', { ascending: false }),
    supabase.from('exam_attempts').select('id,exam_id,user_id,status,started_at,submitted_at,violation_count,face_violation_count,auto_score,manual_score,max_score').in('status', ['submitted', 'graded', 'disqualified']).order('started_at', { ascending: false }),
  ])

  const examMap = new Map((exams || []).map((exam) => [exam.id, exam.title]))
  const userMap = new Map((profiles || []).map((profile) => [profile.id, profile.display_name || profile.email || 'Student']))
  const pending = (attempts || []).filter((attempt) => attempt.status === 'submitted').length
  const published = (exams || []).filter((exam) => exam.status === 'published').length

  return (
    <main>
      <div className="container admin-content">
        <div className="page-head">
          <div>
            <div className="eyebrow">Administration</div>
            <h1 className="page-title">Control center</h1>
            <p className="muted">Manage student access, examinations, submissions, and grading.</p>
          </div>
          <div className="actions">
            <Link className="btn btn-secondary" href="/admin/submissions">All submissions</Link>
            <Link className="btn btn-primary" href="/admin/exams/new">Create exam</Link>
          </div>
        </div>

        <div className="grid grid-4 admin-stats">
          <div className="stat"><b>{profiles?.length || 0}</b><span className="small muted">students</span></div>
          <div className="stat"><b>{published}</b><span className="small muted">published exams</span></div>
          <div className="stat"><b>{attempts?.length || 0}</b><span className="small muted">submissions</span></div>
          <div className="stat"><b>{pending}</b><span className="small muted">awaiting grading</span></div>
        </div>

        <section className="section" id="students"><AdminStudentCreator /></section>

        <section className="section">
          <div className="section-title-row"><div><div className="eyebrow">Examinations</div><h3>Exam management</h3></div></div>
          <div className="table-wrap">
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
                        <select className="select compact-select" name="status" defaultValue={exam.status}>
                          <option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option>
                        </select>
                        <button className="btn btn-secondary">Update</button>
                      </form>
                    </td>
                  </tr>
                ))}
                {!exams?.length && <tr><td colSpan={4} className="muted">No exams have been created.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="section">
          <div className="section-title-row">
            <div><div className="eyebrow">Submissions</div><h3>All completed attempts</h3></div>
            <Link className="table-link" href="/admin/submissions">Open submissions view</Link>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Candidate</th><th>Exam</th><th>Status</th><th>Tab / face</th><th>Grade</th><th></th></tr></thead>
              <tbody>
                {(attempts || []).map((attempt) => (
                  <tr key={attempt.id}>
                    <td>{userMap.get(attempt.user_id) || 'Student'}</td>
                    <td>{examMap.get(attempt.exam_id) || 'Exam'}</td>
                    <td><span className={attempt.status === 'disqualified' ? 'badge red' : 'badge'}>{attempt.status}</span></td>
                    <td>{attempt.violation_count} / {attempt.face_violation_count}</td>
                    <td>{attempt.status === 'graded' ? `${Number(attempt.auto_score) + Number(attempt.manual_score)} / ${Number(attempt.max_score)}` : attempt.status === 'submitted' ? 'Pending' : '—'}</td>
                    <td><Link className="table-link" href={`/admin/attempts/${attempt.id}`}>Review & mark</Link></td>
                  </tr>
                ))}
                {!attempts?.length && <tr><td colSpan={6} className="muted">No submissions yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="section">
          <div className="section-title-row"><div><div className="eyebrow">Directory</div><h3>Students</h3></div></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Email</th><th>Verification</th><th>Access</th><th>Created</th><th>Recovery</th></tr></thead>
              <tbody>
                {(profiles || []).map((profile) => (
                  <tr key={profile.id}>
                    <td><strong>{profile.display_name || 'Student'}</strong></td>
                    <td>{profile.email || '—'}</td>
                    <td><span className={profile.email_verified ? 'badge' : 'badge red'}>{profile.email_verified ? 'Verified' : 'Pending'}</span></td>
                    <td><span className={profile.provisioned ? 'badge' : 'badge red'}>{profile.provisioned ? 'Provisioned' : 'Blocked'}</span></td>
                    <td>{new Date(profile.created_at).toLocaleString('en-IN')}</td>
                    <td><AdminPasswordResetButton studentId={profile.id} /></td>
                  </tr>
                ))}
                {!profiles?.length && <tr><td colSpan={6} className="muted">No student accounts yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  )
}
