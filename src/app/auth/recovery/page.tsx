import type { Metadata } from 'next'
import { RecoveryPasswordForm } from '@/components/RecoveryPasswordForm'

export const metadata: Metadata = { title: 'Reset password' }
export const dynamic = 'force-dynamic'

export default function RecoveryPage() {
  return (
    <main className="auth-page">
      <div className="auth-panel">
        <div className="auth-brand">
          <span className="brand-mark" aria-hidden />
          ExamCore
        </div>
        <div className="auth-card">
          <div className="eyebrow">Password recovery</div>
          <h1 className="auth-title">Choose a new password</h1>
          <p className="muted auth-copy">This page unlocks only from the one-time recovery link sent to your registered email.</p>
          <RecoveryPasswordForm />
        </div>
      </div>
    </main>
  )
}
