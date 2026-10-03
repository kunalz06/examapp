import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { SignOutButton } from '@/components/SignOutButton'

export async function Header() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let role: 'student' | 'admin' | null = null
  if (user) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    role = profile?.role ?? null
  }

  return (
    <header className="site-header">
      <div className="container nav">
        <Link href="/" className="brand" aria-label="ExamCore home">
          <span className="brand-mark" aria-hidden />
          <span>ExamCore</span>
        </Link>

        <nav className="nav-links" aria-label="Primary navigation">
          <Link className="hide-mobile" href="/privacy">Privacy</Link>
          <Link className="hide-mobile" href="/terms">Terms</Link>
          {user ? (
            <>
              {role !== 'admin' && <Link href="/dashboard">My exams</Link>}
              <SignOutButton />
            </>
          ) : (
            <Link className="btn btn-primary" href="/login">Student sign in</Link>
          )}
        </nav>
      </div>
    </header>
  )
}
