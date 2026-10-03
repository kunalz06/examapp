import type { Metadata } from 'next'
import Link from 'next/link'
import { requireAdmin } from '@/lib/auth'
import { ExamBuilder } from '@/components/ExamBuilder'

export const metadata: Metadata = { title: 'Create exam' }

export default async function NewExamPage() {
  await requireAdmin()

  return (
    <main>
      <div className="container narrow-wide admin-content">
        <div className="page-head">
          <div>
            <div className="eyebrow">Examinations</div>
            <h1 className="page-title">Create exam</h1>
            <p className="muted">Build the paper, set its duration and schedule, then publish it when ready.</p>
          </div>
          <Link className="btn btn-secondary" href="/admin">Back to overview</Link>
        </div>
        <ExamBuilder />
      </div>
    </main>
  )
}
