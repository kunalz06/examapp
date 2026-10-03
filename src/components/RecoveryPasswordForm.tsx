'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export function RecoveryPasswordForm() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('Validating recovery link…')

  useEffect(() => {
    const supabase = createClient()

    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setReady(true)
        setMessage('')
      } else {
        setMessage('This password reset link is invalid or has expired.')
      }
    })

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') && session) {
        setReady(true)
        setMessage('')
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const password = String(form.get('password') || '')
    const confirm = String(form.get('confirm') || '')

    if (password.length < 8 || password.length > 128) {
      setMessage('Password must be between 8 and 128 characters.')
      return
    }
    if (password !== confirm) {
      setMessage('Passwords do not match.')
      return
    }

    setBusy(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)

    if (error) {
      setMessage('Password could not be updated. Request another reset from your administrator.')
      return
    }

    await supabase.auth.signOut()
    router.replace('/login?reset=1')
    router.refresh()
  }

  return (
    <form className="form" onSubmit={submit}>
      {message && <div className="notice" role="status">{message}</div>}
      <div className="field">
        <label htmlFor="recovery-password">New password</label>
        <input className="input" id="recovery-password" name="password" type="password" autoComplete="new-password" minLength={8} maxLength={128} disabled={!ready} required />
      </div>
      <div className="field">
        <label htmlFor="recovery-confirm">Confirm password</label>
        <input className="input" id="recovery-confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} maxLength={128} disabled={!ready} required />
      </div>
      <button className="btn btn-primary btn-block" disabled={!ready || busy}>{busy ? 'Updating…' : 'Set new password'}</button>
    </form>
  )
}
