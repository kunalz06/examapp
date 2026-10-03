import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type Reservation = { ok?: boolean; reservationId?: string; retryAfter?: number }

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role,provisioned,email_verified')
    .eq('id', user.id)
    .maybeSingle()

  if (profile?.role !== 'student' || !profile.provisioned || !profile.email_verified) {
    return NextResponse.json({ error: 'Verified student access required.' }, { status: 403 })
  }

  const body = await request.json().catch(() => null) as { currentPassword?: string; newPassword?: string } | null
  const currentPassword = String(body?.currentPassword || '')
  const newPassword = String(body?.newPassword || '')

  if (currentPassword.length < 8 || newPassword.length < 8 || newPassword.length > 128) {
    return NextResponse.json({ error: 'Passwords must be between 8 and 128 characters.' }, { status: 400 })
  }
  if (currentPassword === newPassword) {
    return NextResponse.json({ error: 'Choose a new password different from the current password.' }, { status: 400 })
  }

  const { data: reservationRaw, error: reserveError } = await supabase.rpc('reserve_student_password_change')
  if (reserveError) return NextResponse.json({ error: reserveError.message }, { status: 400 })

  const reservation = reservationRaw as unknown as Reservation
  if (!reservation.ok || !reservation.reservationId) {
    return NextResponse.json({ error: 'Password change limit reached.', retryAfter: Number(reservation.retryAfter || 0) }, { status: 429 })
  }

  const finish = async (success: boolean) => {
    await supabase.rpc('finish_student_password_change', {
      p_reservation_id: reservation.reservationId!,
      p_success: success,
    })
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: newPassword,
    current_password: currentPassword,
  })

  if (updateError) {
    await finish(false)
    return NextResponse.json({ error: 'Current password is incorrect or the new password was not accepted.' }, { status: 400 })
  }

  await finish(true)
  await supabase.auth.signOut({ scope: 'others' })
  return NextResponse.json({ ok: true })
}
