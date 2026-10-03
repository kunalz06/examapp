import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { SignOutButton } from '@/components/SignOutButton'

export async function Header() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <header className="site-header">
      <div className="container nav">
        <Link href="/" className="brand">
          <span className="brand-mark" aria-hidden />
          ExamCore
        </Link>
        <nav className="nav-links" aria-label="Primary">
          <Link className="hide-mobile" href="/privacy">Privacy</Link>
          <Link className="hide-mobile" href="/terms">Terms</Link>
          {user ? (
            <>
              <Link href="/dashboard">Dashboard</Link>
              <SignOutButton />
            </>
          ) : (
            <Link className="btn btn-primary" href="/login">Sign in</Link>
          )}
        </nav>
      </div>
    </header>
  )
}
