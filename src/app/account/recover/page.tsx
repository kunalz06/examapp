import type { Metadata } from 'next'
import { RecoveryPasswordForm } from '@/components/RecoveryPasswordForm'

export const metadata: Metadata = { title: 'Reset password' }

export default function RecoveryPage() {
  return (
    <main className="auth-page">
      <div className="auth-panel">
        <div className="auth-brand"><span className="brand-mark" aria-hidden />ExamCore</div>
        <div className="auth-card">
          <div className="eyebrow">Password recovery</div>
          <h1 className="auth-title">Choose a new password</h1>
          <p className="muted auth-copy">Use this page only from the reset email sent after an administrator initiates recovery.</p>
          <RecoveryPasswordForm />
        </div>
      </div>
    </main>
  )
}
