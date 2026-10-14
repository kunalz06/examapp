import type { Metadata } from 'next'
import Link from 'next/link'
import { requireAdmin } from '@/lib/auth'
import { MonitorAutoRefresh } from '@/components/MonitorAutoRefresh'

export const metadata: Metadata = { title: 'Exam monitor' }
export const dynamic = 'force-dynamic'

export default async function MonitorPage() {
  const { supabase } = await requireAdmin()

  const [
    { data: attempts, error: attemptsError },
    { data: phoneEvents, error: eventsError },
    { data: exams },
    { data: candidates },
  ] = await Promise.all([
    supabase.from('exam_attempts')
      .select('id,exam_id,user_id,status,started_at,expires_at,violation_count,face_violation_count')
      .order('started_at', { ascending: false }).limit(200),
    supabase.from('proctor_events')
      .select('id,attempt_id,event_type,occurred_at,details')
      .in('event_type', ['phone_detected', 'phone_monitor_error'])
      .order('occurred_at', { ascending: false }).limit(250),
    supabase.from('exams').select('id,title'),
    supabase.from('profiles').select('id,display_name,email').eq('role', 'student'),
  ])

  const examNames = new Map((exams || []).map((exam) => [exam.id, exam.title]))
  const studentNames = new Map((candidates || []).map((candidate) => [
    candidate.id, candidate.display_name || candidate.email || 'Student',
  ]))
  const phoneIncidents = (phoneEvents || []).filter((event) => event.event_type === 'phone_detected')
  const lastIncident = new Map<string, (typeof phoneIncidents)[number]>()
  for (const event of phoneIncidents) {
    if (!lastIncident.has(event.attempt_id)) lastIncident.set(event.attempt_id, event)
  }
  const attemptNames = new Map((attempts || []).map((attempt) => [attempt.id, attempt]))
  const live = (attempts || []).filter((attempt) => attempt.status === 'in_progress')
  const recentPhoneIncidents = phoneIncidents.slice(0, 35)

  return (
    <main>
      <div className="container admin-content">
        <div className="page-head">
          <div>
            <div className="eyebrow">Administrator · Proctoring</div>
            <h1 className="page-title">Exam monitor</h1>
            <p className="muted">Review live attempt status and potential phone sightings reported by on-device camera analysis.</p>
          </div>
          <div className="actions">
            <MonitorAutoRefresh />
            <Link className="btn btn-secondary" href="/admin/submissions">Submissions</Link>
          </div>
        </div>

        {(attemptsError || eventsError) && (
          <div className="alert" role="alert">Monitoring data could not be loaded. Check the phone-event migration and database permissions before enabling this feature.</div>
        )}

        <div className="grid grid-3 admin-stats">
          <div className="stat"><b>{live.length}</b><span className="small muted">active attempts (latest 200)</span></div>
          <div className="stat"><b>{live.filter((attempt) => lastIncident.has(attempt.id)).length}</b><span className="small muted">active attempts with phone flags</span></div>
          <div className="stat"><b>{phoneIncidents.length}</b><span className="small muted">recent phone alerts (latest 250 events)</span></div>
        </div>

        <div className="notice section">
          Phone detection provides a <strong>review signal, not proof of misconduct</strong>.
          It does not automatically disqualify students. Only scores, timestamps and event metadata
          are stored; this monitor does not display, stream, or record webcam images.
        </div>

        <section className="section">
          <div className="section-title-row">
            <div><div className="eyebrow">Live</div><h2 className="section-heading">Active attempts</h2></div>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Student</th><th>Exam</th><th>Started</th><th>Tab / face</th><th>Phone check</th><th>Review</th></tr></thead>
              <tbody>
                {live.map((attempt) => {
                  const phone = lastIncident.get(attempt.id)
                  return (
                    <tr key={attempt.id}>
                      <td><strong>{studentNames.get(attempt.user_id) || 'Student'}</strong></td>
                      <td>{examNames.get(attempt.exam_id) || 'Exam'}</td>
                      <td>{new Date(attempt.started_at).toLocaleString('en-IN')}</td>
                      <td>{attempt.violation_count} / {attempt.face_violation_count}</td>
                      <td>{phone
                        ? <span className="badge red">Phone flagged · {new Date(phone.occurred_at).toLocaleTimeString('en-IN')}</span>
                        : <span className="badge">No phone events</span>}</td>
                      <td><Link className="table-link" href={`/admin/attempts/${attempt.id}`}>Review attempt</Link></td>
                    </tr>
                  )
                })}
                {!live.length && <tr><td colSpan={6} className="muted">No active attempts in the most recent 200 records.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="section">
          <div className="section-title-row">
            <div><div className="eyebrow">Review queue</div><h2 className="section-heading">Recent possible phone detections</h2></div>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Detected</th><th>Student</th><th>Exam</th><th>Confidence</th><th>Attempt</th></tr></thead>
              <tbody>
                {recentPhoneIncidents.map((event) => {
                  const attempt = attemptNames.get(event.attempt_id)
                  const details = event.details && typeof event.details === 'object' && !Array.isArray(event.details)
                    ? event.details : {}
                  const confidence = typeof details.confidence === 'number'
                    ? `${Math.round(details.confidence * 100)}%` : '—'
                  return (
                    <tr key={event.id}>
                      <td>{new Date(event.occurred_at).toLocaleString('en-IN')}</td>
                      <td>{attempt ? studentNames.get(attempt.user_id) || 'Student' : 'Earlier attempt'}</td>
                      <td>{attempt ? examNames.get(attempt.exam_id) || 'Exam' : '—'}</td>
                      <td>{confidence}</td>
                      <td><Link className="table-link" href={`/admin/attempts/${event.attempt_id}`}>Inspect</Link></td>
                    </tr>
                  )
                })}
                {!recentPhoneIncidents.length && <tr><td colSpan={5} className="muted">No phone sightings reported.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  )
}
