'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth'
import type { Database } from '@/lib/database.types'

type ExamStatus = Database['public']['Enums']['exam_status']
const allowedStatuses = new Set<ExamStatus>(['draft', 'published', 'archived'])

export async function setExamStatus(formData: FormData) {
  const { supabase } = await requireAdmin()
  const examId = String(formData.get('examId') || '')
  const status = String(formData.get('status') || '')
  if (!examId || !allowedStatuses.has(status as ExamStatus)) return

  const { error } = await supabase
    .from('exams')
    .update({ status: status as ExamStatus, updated_at: new Date().toISOString() })
    .eq('id', examId)

  if (error) throw new Error(error.message)
  revalidatePath('/admin')
  revalidatePath('/dashboard')
}

export async function gradeAnswer(formData: FormData) {
  const { supabase } = await requireAdmin()
  const attemptId = String(formData.get('attemptId') || '')
  const questionId = String(formData.get('questionId') || '')
  const feedback = String(formData.get('feedback') || '').slice(0, 5000)
  const score = Number(String(formData.get('score') || ''))

  if (!attemptId || !questionId || !Number.isFinite(score)) {
    throw new Error('Invalid grading data')
  }

  const { error } = await supabase.rpc('admin_grade_answer', {
    p_attempt_id: attemptId,
    p_question_id: questionId,
    p_score: score,
    p_feedback: feedback,
  })

  if (error) throw new Error(error.message)

  revalidatePath(`/admin/attempts/${attemptId}`)
  revalidatePath('/admin')
  revalidatePath('/admin/submissions')
  revalidatePath(`/attempt/${attemptId}/result`)
  revalidatePath('/dashboard')
}
