import type { Metadata } from 'next'
import Link from 'next/link'
import { requireStudent } from '@/lib/auth'
import { ChangePasswordForm } from '@/components/ChangePasswordForm'

export const metadata: Metadata = { title: 'Change password' }

export default async function ChangePasswordPage() {
  await requireStudent()
  return (
    <main>
      <div className="container narrow">
        <div className="page-head">
          <div><div className="eyebrow">Student account</div><h1 className="page-title">Password settings</h1></div>
          <Link className="btn btn-secondary" href="/dashboard">Back to dashboard</Link>
        </div>
        <ChangePasswordForm />
      </div>
    </main>
  )
}
