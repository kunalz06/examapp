'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export function SignOutButton({ redirectTo = '/' }: { redirectTo?: string }) {
  const router = useRouter()

  async function signOut() {
    await createClient().auth.signOut()
    router.replace(redirectTo)
    router.refresh()
  }

  return <button className="btn btn-secondary" onClick={signOut}>Sign out</button>
}
