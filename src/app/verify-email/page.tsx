import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { EmailVerificationForm } from '@/components/EmailVerificationForm'

export const metadata: Metadata = { title: 'Verify email' }
export const dynamic = 'force-dynamic'

export default async function VerifyEmailPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role,provisioned,email_verified,email')
    .eq('id', user.id)
    .maybeSingle()

  if (profile?.role === 'admin') redirect('/admin')
  if (profile?.role !== 'student' || !profile.provisioned) redirect('/login?error=account_unavailable')
  if (profile.email_verified) redirect('/dashboard')

  return (
    <main className="auth-page">
      <div className="auth-panel">
        <div className="auth-brand"><span className="brand-mark" aria-hidden />ExamCore</div>
        <div className="auth-card">
          <div className="eyebrow">Email confirmation</div>
          <h1 className="auth-title">Verify your student account</h1>
          <p className="muted auth-copy">Complete this once before accessing examinations.</p>
          <EmailVerificationForm email={profile.email || user.email || 'your registered email'} />
        </div>
      </div>
    </main>
  )
}
