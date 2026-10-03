'use client'

import { useState } from 'react'

export function AdminPasswordResetButton({ studentId }: { studentId: string }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function resetPassword() {
    if (!window.confirm('Send this student a password reset email?')) return
    setBusy(true)
    setMessage('')

    const response = await fetch(`/api/admin/students/${studentId}/reset-password`, { method: 'POST' })
    const body = await response.json().catch(() => ({ error: 'Password reset could not be started.' }))
    setBusy(false)
    setMessage(response.ok ? 'Reset email sent.' : body.error || 'Password reset could not be started.')
  }

  return (
    <div className="stack">
      <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => void resetPassword()}>
        {busy ? 'Sending…' : 'Reset password'}
      </button>
      {message && <span className="small muted">{message}</span>}
    </div>
  )
}
