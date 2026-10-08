'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

type Student = { id: string; name: string; email: string; verified: boolean; hasAttempt: boolean }
type Slot = { id: string; startsAt: string; endsAt: string; capacity: number; bookedBy: string[] }

export function ExamScheduleManager({
  examId, durationMinutes, students, assignedIds, slots,
}: {
  examId: string
  durationMinutes: number
  students: Student[]
  assignedIds: string[]
  slots: Slot[]
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<string[]>(assignedIds)
  const [busy, setBusy] = useState<'assign' | 'slot' | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const selectedSet = new Set(selected)

  async function saveAssignments() {
    if (busy) return
    setBusy('assign')
    setError('')
    setMessage('')
    try {
      const response = await fetch('/api/admin/exams/' + examId + '/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'assign', studentIds: selected }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Unable to save student allotments')
      setMessage('Student allotments saved.')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save allotments')
    } finally {
      setBusy(null)
    }
  }

  async function createSlot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy('slot')
    setError('')
    setMessage('')

    const form = event.currentTarget
    const values = new FormData(form)
    const startsAtLocal = String(values.get('startsAt') || '')
    const endsAtLocal = String(values.get('endsAt') || '')
    const capacity = Number(values.get('capacity'))
    const start = new Date(startsAtLocal)
    const end = new Date(endsAtLocal)

    try {
      if (!startsAtLocal || !endsAtLocal || !Number.isFinite(start.getTime())
        || !Number.isFinite(end.getTime()) || end.getTime() - start.getTime() < durationMinutes * 60000) {
        throw new Error('The slot must allow at least ' + durationMinutes + ' minutes.')
      }
      const response = await fetch('/api/admin/exams/' + examId + '/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_slot',
          startsAt: start.toISOString(),
          endsAt: end.toISOString(),
          capacity,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Unable to create slot')
      form.reset()
      setMessage('Exam slot created.')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create slot')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="stack">
      {error && <div className="alert" role="alert">{error}</div>}
      {message && <div className="success" role="status">{message}</div>}

      <section className="card stack">
        <div>
          <h2 className="section-heading">Allotted students</h2>
          <p className="muted small">Select which students may book a slot and take this exam. Students who already started an attempt cannot be unassigned.</p>
        </div>
        <div className="actions">
          <button className="btn btn-secondary" type="button" disabled={Boolean(busy)}
            onClick={() => setSelected(students.map((s) => s.id))}>Select all</button>
          <button className="btn btn-secondary" type="button" disabled={Boolean(busy)}
            onClick={() => setSelected(students.filter((s) => s.hasAttempt).map((s) => s.id))}>Clear unstarted students</button>
          <span className="small muted">{selected.length} selected</span>
        </div>
        <div className="requirement-list">
          {students.map((student) => (
            <label className="consent-row" key={student.id}>
              <input type="checkbox" checked={selectedSet.has(student.id)}
                disabled={student.hasAttempt || Boolean(busy)}
                onChange={(event) => {
                  setSelected((before) =>
                    event.target.checked ? [...before, student.id] : before.filter((id) => id !== student.id),
                  )
                }}
              />
              <span>
                <strong>{student.name}</strong> <span className="small muted">({student.email})</span>
                {!student.verified && <span className="small muted"> · Email not verified</span>}
                {student.hasAttempt && <span className="small muted"> · Attempt already started (locked)</span>}
              </span>
            </label>
          ))}
          {!students.length && <p className="muted">Create student accounts from the Admin portal before allotting them.</p>}
        </div>
        <div className="actions">
          <button className="btn btn-primary" type="button" disabled={Boolean(busy)}
            onClick={() => void saveAssignments()}>{busy === 'assign' ? 'Saving…' : 'Save allotted students'}</button>
        </div>
      </section>

      <section className="card stack">
        <div>
          <h2 className="section-heading">Create an exam slot</h2>
          <p className="muted small">Times are entered in your device's local time zone. Each slot must last at least {durationMinutes} minutes. Capacity limits are enforced when students book.</p>
        </div>
        <form className="form" onSubmit={(event) => void createSlot(event)}>
          <div className="grid grid-3">
            <div className="field">
              <label htmlFor="slot-start">Starts at</label>
              <input className="input" id="slot-start" name="startsAt" type="datetime-local" required />
            </div>
            <div className="field">
              <label htmlFor="slot-end">Ends at</label>
              <input className="input" id="slot-end" name="endsAt" type="datetime-local" required />
            </div>
            <div className="field">
              <label htmlFor="slot-capacity">Maximum students</label>
              <input className="input" id="slot-capacity" name="capacity" type="number" min={1} max={10000} defaultValue={30} required />
            </div>
          </div>
          <div className="actions">
            <button className="btn btn-primary" disabled={Boolean(busy)}>{busy === 'slot' ? 'Creating…' : 'Create slot'}</button>
          </div>
        </form>
      </section>

      <section className="card stack">
        <h2 className="section-heading">Scheduled slots</h2>
        {slots.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Start</th><th>End</th><th>Booked / capacity</th><th>Booked students</th></tr></thead>
              <tbody>
                {slots.map((slot) => (
                  <tr key={slot.id}>
                    <td>{new Date(slot.startsAt).toLocaleString()}</td>
                    <td>{new Date(slot.endsAt).toLocaleString()}</td>
                    <td>{slot.bookedBy.length} / {slot.capacity}</td>
                    <td>{slot.bookedBy.length
                      ? slot.bookedBy.map((id) => students.find((s) => s.id === id)?.name || id).join(', ')
                      : 'None yet'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="muted">No slots created. Students cannot start this exam until a slot is available.</p>}
      </section>
    </div>
  )
}
