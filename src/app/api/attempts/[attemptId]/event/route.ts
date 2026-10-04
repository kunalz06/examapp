import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { Database, Json } from '@/lib/database.types'

type ProctorEventType = Database['public']['Enums']['proctor_event_type']

const allowedEvents = new Set<ProctorEventType>([
  'tab_hidden',
  'fullscreen_exit',
  'media_ended',
  'media_permission_denied',
  'window_blur',
  'face_missing_warning',
  'multiple_faces_warning',
  'face_monitor_error',
])

export async function POST(request: Request, { params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null) as {
    eventId?: string
    type?: string
    details?: Json
  } | null

  if (!body?.eventId || !body.type || !allowedEvents.has(body.type as ProctorEventType)) {
    return NextResponse.json({ error: 'Invalid proctoring event' }, { status: 400 })
  }

  const { error } = await supabase.from('proctor_events').upsert({
    client_event_id: body.eventId,
    attempt_id: attemptId,
    user_id: user.id,
    event_type: body.type as ProctorEventType,
    details: body.details ?? {},
  }, { onConflict: 'client_event_id', ignoreDuplicates: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const { data: attempt } = await supabase
    .from('exam_attempts')
    .select('status,violation_count,face_violation_count')
    .eq('id', attemptId)
    .eq('user_id', user.id)
    .single()

  if (!attempt) return NextResponse.json({ error: 'Attempt not found' }, { status: 404 })
  return NextResponse.json({ status: attempt.status, violationCount: attempt.violation_count, faceViolationCount: attempt.face_violation_count })
}
