import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { Json } from '@/lib/database.types'

export async function PUT(request: Request, { params }: { params: Promise<{ examId: string }> }) {
  const { examId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles')
    .select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Administrator access required' }, { status: 403 })

  let payload: unknown
  try {
    const body = await request.text()
    if (body.length > 900_000) {
      return NextResponse.json({ error: 'Exam data exceeds the size limit' }, { status: 413 })
    }
    payload = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
    !('questions' in payload) || !Array.isArray(payload.questions) ||
    payload.questions.length < 1 || payload.questions.length > 200) {
    return NextResponse.json({ error: 'Provide between 1 and 200 questions' }, { status: 400 })
  }

  // The database function locks the exam, checks attempt history, validates
  // complete question/options/keys, then applies everything transactionally.
  const { data, error } = await supabase.rpc('admin_update_exam', {
    p_exam_id: examId,
    p_payload: payload as Json,
  })

  if (error) {
    const status = error.code === '42501' ? 403
      : error.code === 'P0002' ? 404
        : error.code === '40001' || error.code === '55000' ? 409
          : 400
    return NextResponse.json({ error: error.message }, { status })
  }

  const result = data as { updatedAt?: string; questionCount?: number } | null
  return NextResponse.json({
    ok: true,
    updatedAt: result?.updatedAt,
    questionCount: result?.questionCount,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
