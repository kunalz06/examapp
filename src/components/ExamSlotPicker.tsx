'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export type ExamSlot = {
  id: string
  startsAt: string
  endsAt: string
  capacity: number
  bookedCount: number
  selected: boolean
}

const displayDate = (input: string) => new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: 'numeric', month: 'short', year: 'numeric',
  hour: 'numeric', minute: '2-digit', hour12: true,
}).format(new Date(input))

export function ExamSlotPicker({
  examId, initialSlots, hasAttempt,
}: {
  examId: string
  initialSlots: ExamSlot[]
  hasAttempt: boolean
}) {
  const router = useRouter()
  const [slots, setSlots] = useState(initialSlots)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [now, setNow] = useState(0)

  useEffect(() => setSlots(initialSlots), [initialSlots])
  useEffect(() => {
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 15000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const selected = slots.find((slot) => slot.selected)
    if (!selected || !now || hasAttempt) return
    const startTime = Date.parse(selected.startsAt)
    if (now < startTime && startTime - now <= 15000) {
      const timer = window.setTimeout(() => router.refresh(), Math.max(200, startTime - now + 1000))
      return () => window.clearTimeout(timer)
    }
  }, [slots, now, hasAttempt, router])

  async function chooseSlot(slotId: string) {
    if (busyId || hasAttempt) return
    setBusyId(slotId)
    setMessage('')
    setError('')
    try {
      const response = await fetch('/api/exams/' + examId + '/slots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slotId }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Could not reserve this slot')
      setSlots((current) => current.map((slot) => ({ ...slot, selected: slot.id === slotId })))
      setMessage('Your slot is reserved.')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Slot selection failed')
      const response = await fetch('/api/exams/' + examId + '/slots', { cache: 'no-store' }).catch(() => null)
      if (response?.ok) {
        const data = await response.json().catch(() => ({}))
        if (Array.isArray(data.slots)) setSlots(data.slots as ExamSlot[])
      }
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="section stack">
      <div>
        <h2 className="section-heading">Choose your exam slot</h2>
        <p className="muted small">Slots are shown in Indian Standard Time (IST). Select a slot before it begins. One booking per exam; you can change it before your existing slot starts.</p>
      </div>
      {error && <div className="alert" role="alert">{error}</div>}
      {message && <div className="success" role="status">{message}</div>}
      {slots.length ? (
        <div className="stack">
          {slots.map((slot) => {
            const started = now > 0 && Date.parse(slot.startsAt) <= now
            const finished = now > 0 && Date.parse(slot.endsAt) <= now
            const available = !started && !finished && slot.bookedCount < slot.capacity
            return (
              <div className="card" key={slot.id}>
                <div className="actions" style={{ justifyContent: 'space-between' }}>
                  <div>
                    <strong>{displayDate(slot.startsAt)}</strong>
                    <div className="muted small">Until {displayDate(slot.endsAt)}</div>
                    <div className="small muted">{slot.bookedCount} of {slot.capacity} seats booked</div>
                  </div>
                  <div className="actions">
                    {slot.selected && <span className="badge">Selected</span>}
                    {!slot.selected && (
                      <button className="btn btn-secondary" type="button"
                        disabled={hasAttempt || Boolean(busyId) || !available}
                        onClick={() => void chooseSlot(slot.id)}>
                        {busyId === slot.id ? 'Reserving…' : finished ? 'Ended' : started ? 'Started' : !available ? 'Full' : 'Select slot'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="notice">The administrator has not created any slots yet. You can return when slots are published.</p>
      )}
    </section>
  )
}
