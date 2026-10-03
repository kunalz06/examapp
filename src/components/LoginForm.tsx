'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export function LoginForm() {
  const router = useRouter()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email') || '').trim()
    const password = String(form.get('password') || '')
    const displayName = String(form.get('displayName') || '').trim()
    const supabase = createClient()

    const result = mode === 'signin'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { data: { display_name: displayName } } })

    if (result.error) {
      setMessage(result.error.message)
      setBusy(false)
      return
    }

    if (mode === 'signup' && !result.data.session) {
      setMessage('Account created. Check your email to confirm your address, then sign in.')
      setBusy(false)
      return
    }

    router.replace('/dashboard')
    router.refresh()
  }

  return (
    <form className="form" onSubmit={submit}>
      {mode === 'signup' && (
        <div className="field"><label htmlFor="displayName">Name</label><input className="input" id="displayName" name="displayName" required /></div>
      )}
      <div className="field"><label htmlFor="email">Email</label><input className="input" id="email" name="email" type="email" autoComplete="email" required /></div>
      <div className="field"><label htmlFor="password">Password</label><input className="input" id="password" name="password" type="password" minLength={8} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} required /></div>
      {message && <div className="alert" role="status">{message}</div>}
      <button className="btn btn-primary" disabled={busy}>{busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}</button>
      <button className="btn btn-secondary" type="button" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setMessage('') }}>
        {mode === 'signin' ? 'Create a student account' : 'I already have an account'}
      </button>
    </form>
  )
}
