import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireStudent } from '@/lib/auth'
import { ExamLaunch } from '@/components/ExamLaunch'

export const metadata: Metadata = { title: 'Exam requirements' }

export default async function ExamPage({ params }: { params: Promise<{ examId: string }> }) {
  const { examId } = await params
  const { supabase, user } = await requireStudent()

  const [{ data: exam }, { data: existing }] = await Promise.all([
    supabase.from('exams').select('id,title,description,duration_minutes,starts_at,ends_at').eq('id', examId).single(),
    supabase.from('exam_attempts').select('id,status').eq('exam_id', examId).eq('user_id', user.id).maybeSingle(),
  ])

  if (!exam) notFound()

  return (
    <main>
      <div className="container narrow">
        <div className="card preflight-card">
          <div className="eyebrow">Pre-exam check</div>
          <h1 className="page-title">{exam.title}</h1>
          {exam.description && <p className="lead compact-lead">{exam.description}</p>}

          <div className="grid grid-3 section">
            <div className="stat"><b>{exam.duration_minutes}</b><span className="small muted">minutes</span></div>
            <div className="stat"><b>Camera</b><span className="small muted">required</span></div>
            <div className="stat"><b>Microphone</b><span className="small muted">required</span></div>
          </div>

          <div className="notice section">
            Leaving the exam tab is recorded. The third confirmed tab violation automatically disqualifies the attempt.
            Camera and microphone access must remain active during the exam; media is not recorded or uploaded.
          </div>

          <div className="section">
            {existing ? (
              <div className="alert">An attempt already exists for this exam. Return to your dashboard to resume it or view the result.</div>
            ) : (
              <ExamLaunch examId={exam.id} />
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
