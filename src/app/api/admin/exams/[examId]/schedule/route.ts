import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request, { params }: { params: Promise<{ examId: string }> }) {
  const { examId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => null) as {
    action?: string
    studentIds?: unknown
    startsAt?: unknown
    endsAt?: unknown
    capacity?: unknown
  } | null
  if (!body) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  if (body.action === 'assign') {
    if (!Array.isArray(body.studentIds) || body.studentIds.length > 10000
      || !body.studentIds.every((id) => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id))) {
      return NextResponse.json({ error: 'Invalid student selection' }, { status: 400 })
    }
    const { data, error } = await supabase.rpc('admin_set_exam_students', {
      p_exam_id: examId,
      p_student_ids: body.studentIds as string[],
    })
    if (error) return NextResponse.json({ error: error.message }, { status: error.code === '42501' ? 403 : 400 })
    return NextResponse.json({ ok: true, result: data })
  }

  if (body.action === 'create_slot') {
    if (typeof body.startsAt !== 'string' || typeof body.endsAt !== 'string'
      || !Number.isInteger(body.capacity) || Number(body.capacity) < 1 || Number(body.capacity) > 10000
      || !Number.isFinite(Date.parse(body.startsAt)) || !Number.isFinite(Date.parse(body.endsAt))) {
      return NextResponse.json({ error: 'Invalid slot dates or capacity' }, { status: 400 })
    }
    const { data, error } = await supabase.rpc('admin_create_exam_slot', {
      p_exam_id: examId,
      p_starts_at: body.startsAt,
      p_ends_at: body.endsAt,
      p_capacity: body.capacity as number,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: error.code === '42501' ? 403 : 400 })
    return NextResponse.json({ ok: true, slotId: data })
  }

  return NextResponse.json({ error: 'Unsupported action' }, { status: 400 })
}
