import type { Metadata } from 'next'
import { requireAdmin } from '@/lib/auth'
import { ExamBuilder } from '@/components/ExamBuilder'

export const metadata: Metadata = { title: 'Create exam' }

export default async function NewExamPage() {
  await requireAdmin()
  return (
    <main>
      <div className="container" style={{ maxWidth: 900 }}>
        <div className="page-head">
          <div><div className="eyebrow">Admin · new exam</div><h2 style={{ marginTop: 8 }}>Build an exam</h2><p className="muted">Create single-choice and written questions. New exams start as drafts.</p></div>
        </div>
        <ExamBuilder />
      </div>
    </main>
  )
}
