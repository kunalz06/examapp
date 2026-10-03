'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Portal = 'student' | 'admin'

export function LoginForm({
  portal = 'student',
  verified = false,
  initialMessage = '',
}: {
  portal?: Portal
  verified?: boolean
  initialMessage?: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [resending, setResending] = useState(false)
  const [lastEmail, setLastEmail] = useState('')
  const [showResend, setShowResend] = useState(false)
  const [message, setMessage] = useState(initialMessage)
  const [tone, setTone] = useState<'error' | 'success'>(verified ? 'success' : 'error')

  useEffect(() => {
    if (!verified) return
    const supabase = createClient()
    void supabase.auth.signOut({ scope: 'local' })
    setTone('success')
    setMessage('Email verified. Sign in with the credentials issued by your administrator.')
  }, [verified])

  async function resendVerification() {
    if (!lastEmail || resending) return
    setResending(true)

    await fetch('/api/auth/resend-verification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: lastEmail }),
    }).catch(() => null)

    setTone('success')
    setMessage('If this student account exists, a new verification link has been sent.')
    setResending(false)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    setShowResend(false)

    const form = new FormData(event.currentTarget)
    const email = String(form.get('email') || '').trim()
    const password = String(form.get('password') || '')
    setLastEmail(email)

    const supabase = createClient()
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error || !data.user) {
      const needsConfirmation = /confirm|verified/i.test(error?.message || '')
      setTone('error')
      setMessage(
        needsConfirmation
          ? 'Verify your email before signing in.'
          : 'The email or password is incorrect.'
      )
      setShowResend(portal === 'student' && needsConfirmation)
      setBusy(false)
      return
    }

    if (portal === 'student' && !data.user.email_confirmed_at) {
      await supabase.auth.signOut()
      setTone('error')
      setMessage('Verify your email before signing in.')
      setShowResend(true)
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
      setTone('error')
      setMessage(
        portal === 'admin'
          ? 'Administrator access is not available for this account.'
          : 'This account is not enabled for the student examination portal.'
      )
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
        <input
          className="input"
          id={`${portal}-email`}
          name="email"
          type="email"
          autoComplete="email"
          placeholder="name@example.com"
          required
        />
      </div>

      <div className="field">
        <label htmlFor={`${portal}-password`}>Password</label>
        <input
          className="input"
          id={`${portal}-password`}
          name="password"
          type="password"
          autoComplete="current-password"
          minLength={8}
          required
        />
      </div>

      {message && (
        <div className={tone === 'success' ? 'success' : 'alert'} role="status">
          {message}
        </div>
      )}

      {showResend && portal === 'student' && (
        <button
          className="btn btn-secondary btn-block"
          type="button"
          disabled={resending}
          onClick={() => void resendVerification()}
        >
          {resending ? 'Sending…' : 'Send new verification link'}
        </button>
      )}

      <button className="btn btn-primary btn-block" disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}
