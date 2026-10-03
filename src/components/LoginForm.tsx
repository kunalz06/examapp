'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Portal = 'student' | 'admin'

export function LoginForm({ portal = 'student', initialMessage = '' }: { portal?: Portal; initialMessage?: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(initialMessage)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setMessage('')

    const form = new FormData(event.currentTarget)
    const email = String(form.get('email') || '').trim()
    const password = String(form.get('password') || '')
    const supabase = createClient()

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error || !data.user) {
      setMessage('The email or password is incorrect.')
      setBusy(false)
      return
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role,provisioned')
      .eq('id', data.user.id)
      .maybeSingle()

    const validStudent = portal === 'student' && profile?.role === 'student' && profile.provisioned
    const validAdmin = portal === 'admin' && profile?.role === 'admin'

    if (profileError || (!validStudent && !validAdmin)) {
      await supabase.auth.signOut()
      setMessage(portal === 'admin'
        ? 'Administrator access is not available for this account.'
        : 'This account is not enabled for the student examination portal.')
      setBusy(false)
      return
    }

    router.replace(portal === 'admin' ? '/admin' : '/dashboard')
    router.refresh()
  }

  return (
    <form className="form" onSubmit={submit}>
      <div className="field">
        <label htmlFor={`${portal}-email`}>Email address</label>
        <input className="input" id={`${portal}-email`} name="email" type="email" autoComplete="email" placeholder="name@example.com" required />
      </div>
      <div className="field">
        <label htmlFor={`${portal}-password`}>Password</label>
        <input className="input" id={`${portal}-password`} name="password" type="password" autoComplete="current-password" minLength={8} required />
      </div>
      {message && <div className="alert" role="status">{message}</div>}
      <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
    </form>
  )
}
