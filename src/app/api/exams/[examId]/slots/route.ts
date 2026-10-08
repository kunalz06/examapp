import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(_request: Request, { params }: { params: Promise<{ examId: string }> }) {
  const { examId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await supabase.rpc('get_exam_slots', { p_exam_id: examId })
  if (error) return NextResponse.json({ error: error.message }, { status: error.code === '42501' ? 403 : 400 })
  return NextResponse.json({ slots: data }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: Request, { params }: { params: Promise<{ examId: string }> }) {
  const { examId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null) as { slotId?: string } | null
  if (typeof body?.slotId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.slotId)) {
    return NextResponse.json({ error: 'Invalid slot selection' }, { status: 400 })
  }

  const { data, error } = await supabase.rpc('choose_exam_slot', {
    p_exam_id: examId,
    p_slot_id: body.slotId,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: error.code === '42501' ? 403 : 400 })
  return NextResponse.json({ ok: true, selection: data })
}
