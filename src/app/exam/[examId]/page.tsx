import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { ExamLaunch } from '@/components/ExamLaunch'

export const metadata: Metadata = { title: 'Exam requirements' }

export default async function ExamPage({ params }: { params: Promise<{ examId: string }> }) {
  const { examId } = await params
  const { supabase, user } = await requireUser()

  const [{ data: exam }, { data: existing }] = await Promise.all([
    supabase.from('exams').select('id,title,description,duration_minutes,starts_at,ends_at').eq('id', examId).single(),
    supabase.from('exam_attempts').select('id,status').eq('exam_id', examId).eq('user_id', user.id).maybeSingle(),
  ])

  if (!exam) notFound()

  return (
    <main>
      <div className="container" style={{ maxWidth: 820 }}>
        <div className="card">
          <div className="eyebrow">Pre-exam check</div>
          <h2 style={{ marginTop: 8 }}>{exam.title}</h2>
          <p className="lead">{exam.description}</p>
          <div className="grid grid-3 section">
            <div className="stat"><b>{exam.duration_minutes}</b><span className="small muted">minutes</span></div>
            <div className="stat"><b>Camera</b><span className="small muted">required during exam</span></div>
            <div className="stat"><b>Mic</b><span className="small muted">required during exam</span></div>
          </div>
          <div className="section notice">
            <strong>Tab-switch rule:</strong> each time the exam page becomes hidden, a violation is sent to the server. On the third confirmed violation, the attempt is automatically disqualified. Camera and microphone streams are checked for presence; this starter does not record or upload the media stream.
          </div>
          <div className="section">
            {existing ? (
              <div className="alert">You already have an attempt for this exam. Return to your dashboard to resume or view its result.</div>
            ) : (
              <ExamLaunch examId={exam.id} />
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
