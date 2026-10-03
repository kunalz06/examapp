'use client'

import { FormEvent, useState } from 'react'

function formatRetry(seconds: number) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.ceil((seconds % 3600) / 60)
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes} minute${minutes === 1 ? '' : 's'}`
}

export function ChangePasswordForm() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSuccess('')

    const form = new FormData(event.currentTarget)
    const currentPassword = String(form.get('currentPassword') || '')
    const newPassword = String(form.get('newPassword') || '')
    const confirmPassword = String(form.get('confirmPassword') || '')

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.')
      return
    }

    setBusy(true)
    const response = await fetch('/api/account/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword }),
    })
    const body = await response.json().catch(() => ({ error: 'Password change failed.' }))
    setBusy(false)

    if (!response.ok) {
      setError(response.status === 429 && body.retryAfter
        ? `Password change limit reached. Try again in about ${formatRetry(Number(body.retryAfter))}.`
        : body.error || 'Password change failed.')
      return
    }

    setSuccess('Password changed successfully.')
    ;(event.currentTarget as HTMLFormElement).reset()
  }

  return (
    <form className="card form" onSubmit={submit}>
      <div>
        <div className="eyebrow">Account security</div>
        <h2 className="section-heading">Change password</h2>
        <p className="muted">You can change your password at most twice in any 12-hour period.</p>
      </div>
      <div className="field">
        <label htmlFor="current-password">Current password</label>
        <input className="input" id="current-password" name="currentPassword" type="password" autoComplete="current-password" minLength={8} required />
      </div>
      <div className="field">
        <label htmlFor="new-password">New password</label>
        <input className="input" id="new-password" name="newPassword" type="password" autoComplete="new-password" minLength={8} maxLength={128} required />
      </div>
      <div className="field">
        <label htmlFor="confirm-password">Confirm new password</label>
        <input className="input" id="confirm-password" name="confirmPassword" type="password" autoComplete="new-password" minLength={8} maxLength={128} required />
      </div>
      {error && <div className="alert" role="status">{error}</div>}
      {success && <div className="success" role="status">{success}</div>}
      <button className="btn btn-primary" disabled={busy}>{busy ? 'Changing password…' : 'Change password'}</button>
    </form>
  )
}
