import type { Metadata } from 'next'
import { LoginForm } from '@/components/LoginForm'

export const metadata: Metadata = { title: 'Sign in' }

export default function LoginPage() {
  return (
    <main>
      <div className="container" style={{ maxWidth: 520 }}>
        <div className="card">
          <div className="eyebrow">Account access</div>
          <h2 style={{ marginTop: 10 }}>Sign in or create an account</h2>
          <p className="muted">Use your email and password. New accounts are created as students.</p>
          <LoginForm />
        </div>
      </div>
    </main>
  )
}
