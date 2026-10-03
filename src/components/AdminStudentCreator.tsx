'use client'

import { FormEvent, useState } from 'react'

function generatePassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*'
  const bytes = new Uint32Array(16)
  crypto.getRandomValues(bytes)
  const random = Array.from(bytes, (value) => alphabet[value % alphabet.length]).join('')
  return `A7!${random.slice(3)}`
}

export function AdminStudentCreator() {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [copied, setCopied] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setSuccess('')
    setCopied(false)

    const form = new FormData(event.currentTarget)
    const payload = {
      displayName: String(form.get('displayName') || '').trim(),
      email: String(form.get('email') || '').trim(),
      temporaryPassword: password,
    }

    const response = await fetch('/api/admin/students', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const body = await response.json().catch(() => ({ error: 'Student account could not be created.' }))

    if (!response.ok) {
      setError(body.error || 'Student account could not be created.')
      setBusy(false)
      return
    }

    setSuccess(`Student created for ${payload.email}. Gmail SMTP sent the temporary password and 5-digit verification code.`)
    ;(event.currentTarget as HTMLFormElement).reset()
    setPassword('')
    setBusy(false)
  }

  async function copyPassword() {
    if (!password) return
    await navigator.clipboard.writeText(password)
    setCopied(true)
  }

  return (
    <form className="card form admin-create-student" onSubmit={submit}>
      <div className="section-title-row">
        <div><div className="eyebrow">Student access</div><h3>Create student account</h3></div>
        <span className="badge">Student only</span>
      </div>
      <div className="grid grid-2">
        <div className="field">
          <label htmlFor="student-name">Student name</label>
          <input className="input" id="student-name" name="displayName" minLength={2} maxLength={120} required />
        </div>
        <div className="field">
          <label htmlFor="student-email">Email address</label>
          <input className="input" id="student-email" name="email" type="email" autoComplete="off" required />
        </div>
      </div>
      <div className="field">
        <label htmlFor="student-password">Temporary password</label>
        <div className="credential-row">
          <input className="input code-input" id="student-password" name="temporaryPassword" value={password}
            onChange={(event) => { setPassword(event.target.value); setCopied(false) }}
            minLength={8} maxLength={128} autoComplete="new-password" required />
          <button className="btn btn-secondary" type="button" onClick={() => { setPassword(generatePassword()); setCopied(false) }}>Generate</button>
          <button className="btn btn-secondary" type="button" disabled={!password} onClick={() => void copyPassword()}>{copied ? 'Copied' : 'Copy'}</button>
        </div>
        <span className="field-hint">The student receives this temporary password and a 5-digit verification code by email.</span>
      </div>
      {error && <div className="alert" role="status">{error}</div>}
      {success && <div className="success" role="status">{success}</div>}
      <div className="actions">
        <button className="btn btn-primary" disabled={busy || password.length < 8}>{busy ? 'Creating student…' : 'Create student'}</button>
      </div>
    </form>
  )
}
