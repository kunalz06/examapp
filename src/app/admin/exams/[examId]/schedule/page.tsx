import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/auth'
import { ExamScheduleManager } from '@/components/ExamScheduleManager'

export const metadata: Metadata = { title: 'Exam allotments and slots' }
export const dynamic = 'force-dynamic'

export default async function ExamSchedulePage({ params }: { params: Promise<{ examId: string }> }) {
  const { examId } = await params
  const { supabase } = await requireAdmin()

  const [
    { data: exam },
    { data: profiles },
    { data: assignments },
    { data: slots },
    { data: bookings },
    { data: attempts },
  ] = await Promise.all([
    supabase.from('exams').select('id,title,status,duration_minutes').eq('id', examId).maybeSingle(),
    supabase.from('profiles').select('id,email,display_name,email_verified,provisioned')
      .eq('role', 'student').eq('provisioned', true).order('display_name'),
    supabase.from('exam_assignments').select('student_id').eq('exam_id', examId),
    supabase.from('exam_slots').select('id,starts_at,ends_at,capacity')
      .eq('exam_id', examId).order('starts_at'),
    supabase.from('exam_slot_bookings').select('slot_id,student_id').eq('exam_id', examId),
    supabase.from('exam_attempts').select('user_id').eq('exam_id', examId),
  ])

  if (!exam) notFound()
  const attemptedIds = new Set((attempts || []).map((attempt) => attempt.user_id))

  return (
    <main>
      <div className="container admin-content">
        <div className="page-head">
          <div>
            <div className="eyebrow">Exam schedule · {exam.status}</div>
            <h1 className="page-title">{exam.title}</h1>
            <p className="muted">Assign students and create the slots they can book. Publish the exam from the Admin overview before students can choose slots.</p>
          </div>
          <Link className="btn btn-secondary" href="/admin">Back to Admin</Link>
        </div>
        <ExamScheduleManager
          examId={exam.id}
          durationMinutes={exam.duration_minutes}
          students={(profiles || []).map((profile) => ({
            id: profile.id,
            name: profile.display_name || profile.email || 'Student',
            email: profile.email || '—',
            verified: profile.email_verified,
            hasAttempt: attemptedIds.has(profile.id),
          }))}
          assignedIds={(assignments || []).map((a) => a.student_id)}
          slots={(slots || []).map((s) => ({
            id: s.id,
            startsAt: s.starts_at,
            endsAt: s.ends_at,
            capacity: s.capacity,
            bookedBy: (bookings || []).filter((b) => b.slot_id === s.id).map((b) => b.student_id),
          }))}
        />
      </div>
    </main>
  )
}
