import type { Metadata } from 'next'
import Link from 'next/link'
import { LoginForm } from '@/components/LoginForm'

export const metadata: Metadata = { title: 'Student sign in' }

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const initialMessage = params.error === 'account_unavailable'
    ? 'This account is not enabled for the student examination portal.'
    : params.reset === '1'
      ? 'Password updated. Sign in with your new password.'
      : ''

  return (
    <main className="auth-page">
      <div className="auth-panel">
        <Link className="auth-brand" href="/"><span className="brand-mark" aria-hidden />ExamCore</Link>
        <div className="auth-card">
          <div className="eyebrow">Student portal</div>
          <h1 className="auth-title">Sign in to your exams</h1>
          <p className="muted auth-copy">Use the email and password issued by your examination administrator.</p>
          <LoginForm portal="student" initialMessage={initialMessage} />
          <div className="auth-note">New student accounts complete a one-time 5-digit email verification after sign-in.</div>
        </div>
      </div>
    </main>
  )
}
