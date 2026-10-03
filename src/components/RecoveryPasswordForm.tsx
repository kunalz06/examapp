'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export function RecoveryPasswordForm() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('Validating your secure recovery link…')

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const params = new URLSearchParams(window.location.search)
      const tokenHash = params.get('token_hash')
      const type = params.get('type')

      if (!tokenHash || type !== 'recovery') {
        if (!cancelled) setMessage('This password reset link is invalid or has expired.')
        return
      }

      const supabase = createClient()
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: 'recovery',
      })

      if (cancelled) return

      if (error) {
        setMessage('This password reset link is invalid, expired, or has already been used. Ask your administrator to send another reset email.')
        return
      }

      window.history.replaceState({}, '', '/auth/recovery')
      setReady(true)
      setMessage('')
    })()

    return () => {
      cancelled = true
    }
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
    setMessage('')

    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setBusy(false)
      setMessage('Password could not be updated. Ask your administrator to send another reset email.')
      return
    }

    await supabase.auth.signOut()
    router.replace('/login?reset=1')
    router.refresh()
  }

  return (
    <form className="form" onSubmit={submit}>
      {message && <div className={ready ? 'notice' : 'alert'} role="status">{message}</div>}

      <div className="field">
        <label htmlFor="recovery-password">New password</label>
        <input
          className="input"
          id="recovery-password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          maxLength={128}
          disabled={!ready}
          required
        />
      </div>

      <div className="field">
        <label htmlFor="recovery-confirm">Confirm password</label>
        <input
          className="input"
          id="recovery-confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          minLength={8}
          maxLength={128}
          disabled={!ready}
          required
        />
      </div>

      <button className="btn btn-primary btn-block" disabled={!ready || busy}>
        {busy ? 'Updating…' : 'Set new password'}
      </button>
    </form>
  )
}
