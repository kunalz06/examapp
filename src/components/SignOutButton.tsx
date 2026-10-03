'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export function SignOutButton() {
  const router = useRouter()
  async function signOut() {
    await createClient().auth.signOut()
    router.replace('/')
    router.refresh()
  }
  return <button className="btn btn-secondary" onClick={signOut}>Sign out</button>
}
