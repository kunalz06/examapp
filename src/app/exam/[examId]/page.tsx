import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireStudent } from '@/lib/auth'
import { ExamLaunch } from '@/components/ExamLaunch'
import { ExamSlotPicker, type ExamSlot } from '@/components/ExamSlotPicker'

export const metadata: Metadata = { title: 'Exam requirements' }
export const dynamic = 'force-dynamic'

export default async function ExamPage({ params }: { params: Promise<{ examId: string }> }) {
  const { examId } = await params
  const { supabase, user } = await requireStudent()

  const [{ data: exam }, { data: existing }, { data: assigned }] = await Promise.all([
    supabase.from('exams').select('id,title,description,duration_minutes,starts_at,ends_at')
      .eq('id', examId).maybeSingle(),
    supabase.from('exam_attempts').select('id,status')
      .eq('exam_id', examId).eq('user_id', user.id).maybeSingle(),
    supabase.from('exam_assignments').select('exam_id')
      .eq('exam_id', examId).eq('student_id', user.id).maybeSingle(),
  ])

  if (!exam || (!assigned && !existing)) notFound()

  const { data: slotData, error: slotsError } = await supabase.rpc('get_exam_slots', { p_exam_id: examId })
  if (slotsError) throw new Error('Unable to load exam slots: ' + slotsError.message)

  const slots = Array.isArray(slotData) ? slotData as unknown as ExamSlot[] : []
  const selected = slots.find((slot) => slot.selected)
  const now = Date.now()
  const canStart = Boolean(selected && !existing
    && Date.parse(selected.startsAt) <= now && Date.parse(selected.endsAt) > now
    && (!exam.starts_at || Date.parse(exam.starts_at) <= now)
    && (!exam.ends_at || Date.parse(exam.ends_at) > now))

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
            The third confirmed tab-switch violation ends your exam. Four face-monitor warnings also cause disqualification.
            Camera and microphone access must remain active during the attempt; recordings are not uploaded.
          </div>

          {existing ? (
            <div className="notice section">
              This exam attempt has already started. Resume it, or view the result, from your dashboard.
            </div>
          ) : (
            <>
              <ExamSlotPicker examId={exam.id} initialSlots={slots} hasAttempt={false} />
              <div className="section">
                {canStart ? (
                  <ExamLaunch examId={exam.id} />
                ) : selected && Date.parse(selected.endsAt) <= now ? (
                  <div className="notice">Your selected slot has ended. Contact the administrator if you missed it.</div>
                ) : selected ? (
                  <div className="notice">Your slot is booked. The Start exam button becomes available during your selected slot. Refresh this page once the slot begins.</div>
                ) : (
                  <div className="notice">Select an available slot to unlock the exam start check.</div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  )
}
