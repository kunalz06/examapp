import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { SignOutButton } from '@/components/SignOutButton'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let isAdmin = false
  if (user) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    isAdmin = profile?.role === 'admin'
  }

  return (
    <div className="admin-root">
      {isAdmin && (
        <header className="admin-header">
          <div className="container admin-nav">
            <Link href="/admin" className="admin-brand">
              <span className="brand-mark" aria-hidden />
              <span>ExamCore Admin</span>
            </Link>
            <nav className="admin-links" aria-label="Admin navigation">
              <Link href="/admin">Overview</Link>
              <Link href="/admin/submissions">Submissions</Link>
              <Link href="/admin/exams/new">Create exam</Link>
              <SignOutButton redirectTo="/admin" />
            </nav>
          </div>
        </header>
      )}
      {children}
    </div>
  )
}
