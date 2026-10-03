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
  const { supabase, user } = await requireAdmin()
  const attemptId = String(formData.get('attemptId') || '')
  const questionId = String(formData.get('questionId') || '')
  const feedback = String(formData.get('feedback') || '').slice(0, 5000)
  const scoreRaw = String(formData.get('score') || '')
  const score = Number(scoreRaw)
  if (!attemptId || !questionId || !Number.isFinite(score)) throw new Error('Invalid grading data')

  const grading = {
    manual_score: score,
    grader_feedback: feedback,
    graded_by: user.id,
    graded_at: new Date().toISOString(),
  }
  const { data: existing, error: lookupError } = await supabase
    .from('answers')
    .select('id')
    .eq('attempt_id', attemptId)
    .eq('question_id', questionId)
    .maybeSingle()
  if (lookupError) throw new Error(lookupError.message)

  const result = existing
    ? await supabase.from('answers').update(grading).eq('id', existing.id)
    : await supabase.from('answers').insert({ attempt_id: attemptId, question_id: questionId, ...grading })
  if (result.error) throw new Error(result.error.message)
  revalidatePath(`/admin/attempts/${attemptId}`)
  revalidatePath('/admin')
}
