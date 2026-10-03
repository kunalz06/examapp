import Link from 'next/link'
import { requireAdmin } from '@/lib/auth'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin()
  return (
    <>
      <div style={{ background: '#111', color: '#fff', borderBottom: '4px solid #1457d9' }}>
        <div className="container actions" style={{ minHeight: 52 }}>
          <strong>Admin</strong>
          <Link href="/admin">Overview</Link>
          <Link href="/admin/exams/new">Create exam</Link>
          <Link href="/dashboard">Student view</Link>
        </div>
      </div>
      {children}
    </>
  )
}
