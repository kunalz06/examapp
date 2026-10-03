import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function requireUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect('/login')
  return { supabase, user }
}

export async function requireStudent() {
  const { supabase, user } = await requireUser()
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, display_name, provisioned')
    .eq('id', user.id)
    .maybeSingle()

  if (profile?.role === 'admin') redirect('/admin')
  if (profile?.role !== 'student' || !profile.provisioned) {
    redirect('/login?error=account_unavailable')
  }

  return { supabase, user, profile }
}

export async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect('/admin')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, display_name')
    .eq('id', user.id)
    .maybeSingle()

  if (profile?.role !== 'admin') redirect('/dashboard')
  return { supabase, user, profile }
}
