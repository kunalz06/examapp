'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type StatusResponse = {
  verified?: boolean
  retryAfter?: number
  sendsInWindow?: number
  ok?: boolean
  reason?: string
  error?: string
}

export function EmailVerificationForm({ email }: { email: string }) {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [resending, setResending] = useState(false)
  const [retryAfter, setRetryAfter] = useState(0)
  const [message, setMessage] = useState('')
  const [tone, setTone] = useState<'error' | 'success'>('error')

  async function callVerification(payload: Record<string, unknown>) {
    const response = await fetch('/api/auth/email-verification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const body = await response.json().catch(() => ({ error: 'Verification service unavailable.' })) as StatusResponse
    return { response, body }
  }

  useEffect(() => {
    void (async () => {
      const { response, body } = await callVerification({ action: 'status' })
      if (response.ok) {
        if (body.verified) {
          router.replace('/dashboard')
          router.refresh()
          return
        }
        setRetryAfter(Math.max(0, Number(body.retryAfter || 0)))
      }
    })()
  }, [router])

  useEffect(() => {
    if (retryAfter <= 0) return
    const timer = window.setInterval(() => setRetryAfter((value) => Math.max(0, value - 1)), 1000)
    return () => window.clearInterval(timer)
  }, [retryAfter])

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!/^\d{5}$/.test(code)) {
      setTone('error')
      setMessage('Enter the 5-digit code from your email.')
      return
    }

    setBusy(true)
    setMessage('')
    const { response, body } = await callVerification({ action: 'verify', code })
    setBusy(false)

    if (!response.ok || !body.ok) {
      setTone('error')
      setMessage(body.reason === 'expired'
        ? 'This code has expired. Request a new code.'
        : body.reason === 'locked'
          ? 'Too many incorrect attempts. Request a new code when allowed.'
          : 'The verification code is incorrect.')
      return
    }

    setTone('success')
    setMessage('Email verified. Opening your dashboard…')
    router.replace('/dashboard')
    router.refresh()
  }

  async function resend() {
    if (retryAfter > 0 || resending) return
    setResending(true)
    setMessage('')

    const { response, body } = await callVerification({ action: 'resend' })
    setResending(false)
    setRetryAfter(Math.max(0, Number(body.retryAfter || 0)))

    if (!response.ok) {
      setTone('error')
      setMessage(body.error || 'A new verification code cannot be sent yet.')
      return
    }

    setTone('success')
    setMessage('A new 5-digit verification code was sent.')
  }

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.replace('/login')
    router.refresh()
  }

  const minutes = Math.floor(retryAfter / 60)
  const seconds = retryAfter % 60

  return (
    <div className="stack">
      <div className="notice">
        A 5-digit code was sent to <strong>{email}</strong>. The code expires after 5 minutes.
      </div>

      <form className="form" onSubmit={verify}>
        <div className="field">
          <label htmlFor="verification-code">Verification code</label>
          <input
            className="input code-input"
            id="verification-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{5}"
            maxLength={5}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 5))}
            placeholder="00000"
            required
          />
          <span className="field-hint">Maximum 5 verification attempts per code.</span>
        </div>

        {message && <div className={tone === 'success' ? 'success' : 'alert'} role="status">{message}</div>}

        <button className="btn btn-primary btn-block" disabled={busy || code.length !== 5}>
          {busy ? 'Verifying…' : 'Verify email'}
        </button>
      </form>

      <button className="btn btn-secondary btn-block" type="button" disabled={resending || retryAfter > 0} onClick={() => void resend()}>
        {resending
          ? 'Sending…'
          : retryAfter > 0
            ? `Send another code in ${minutes}:${String(seconds).padStart(2, '0')}`
            : 'Send another code'}
      </button>

      <p className="small muted">Verification emails are limited to two per 5-minute window and must be at least 2.5 minutes apart.</p>
      <button className="table-link" type="button" onClick={() => void signOut()}>Sign out</button>
    </div>
  )
}
