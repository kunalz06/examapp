'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { AttemptStatus, Question } from '@/lib/types'

type SavedAnswer = { question_id: string; selected_option_id: string | null; text_answer: string | null }
type PendingEvent = { eventId: string; type: string; details: Record<string, unknown> }

type Props = {
  attemptId: string
  examTitle: string
  expiresAt: string
  initialViolationCount: number
  questions: Question[]
  initialAnswers: SavedAnswer[]
}

export function ExamRunner({ attemptId, examTitle, expiresAt, initialViolationCount, questions, initialAnswers }: Props) {
  const router = useRouter()
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const submittingRef = useRef(false)
  const [mediaReady, setMediaReady] = useState(false)
  const [mediaError, setMediaError] = useState('')
  const [connectionError, setConnectionError] = useState('')
  const [violationCount, setViolationCount] = useState(initialViolationCount)
  const [status, setStatus] = useState<AttemptStatus>('in_progress')
  const [secondsLeft, setSecondsLeft] = useState(() => Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)))
  const [answers, setAnswers] = useState<Record<string, { selectedOptionId: string; text: string }>>(() => {
    const mapped: Record<string, { selectedOptionId: string; text: string }> = {}
    for (const answer of initialAnswers) {
      mapped[answer.question_id] = { selectedOptionId: answer.selected_option_id || '', text: answer.text_answer || '' }
    }
    return mapped
  })

  const queueKey = useMemo(() => `examcore:events:${attemptId}`, [attemptId])

  const stopMedia = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }, [])

  const syncStatus = useCallback(async () => {
    try {
      const response = await fetch(`/api/attempts/${attemptId}/status`, { cache: 'no-store' })
      if (!response.ok) return
      const data = await response.json()
      setViolationCount(data.violationCount)
      setStatus(data.status)
      if (data.status !== 'in_progress') {
        stopMedia()
        router.replace(`/attempt/${attemptId}/result`)
      }
    } catch {
      // Heartbeat is advisory; save requests surface connectivity issues separately.
    }
  }, [attemptId, router, stopMedia])

  const sendEvent = useCallback(async (event: PendingEvent) => {
    try {
      const response = await fetch(`/api/attempts/${attemptId}/event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
        keepalive: true,
      })
      if (!response.ok) throw new Error('event rejected')
      const data = await response.json()
      setViolationCount(data.violationCount)
      setStatus(data.status)
      setConnectionError('')
      return true
    } catch {
      setConnectionError('Connection issue: proctoring event is queued and will retry when the page is active.')
      return false
    }
  }, [attemptId])

  const saveQueue = useCallback((events: PendingEvent[]) => {
    try { localStorage.setItem(queueKey, JSON.stringify(events)) } catch { /* storage may be unavailable */ }
  }, [queueKey])

  const readQueue = useCallback((): PendingEvent[] => {
    try {
      const raw = localStorage.getItem(queueKey)
      return raw ? JSON.parse(raw) as PendingEvent[] : []
    } catch { return [] }
  }, [queueKey])

  const queueEvent = useCallback(async (type: string, details: Record<string, unknown> = {}) => {
    const event: PendingEvent = { eventId: crypto.randomUUID(), type, details }
    const queue = [...readQueue(), event]
    saveQueue(queue)
    if (type === 'tab_hidden') setViolationCount((count) => Math.min(3, count + 1))
    const ok = await sendEvent(event)
    if (ok) saveQueue(readQueue().filter((item) => item.eventId !== event.eventId))
  }, [readQueue, saveQueue, sendEvent])

  const flushQueue = useCallback(async () => {
    const queue = readQueue()
    if (!queue.length) return
    const remaining: PendingEvent[] = []
    for (const event of queue) {
      const ok = await sendEvent(event)
      if (!ok) remaining.push(event)
    }
    saveQueue(remaining)
    await syncStatus()
  }, [readQueue, saveQueue, sendEvent, syncStatus])

  const startMedia = useCallback(async () => {
    setMediaError('')
    stopMedia()
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      const videoTrack = stream.getVideoTracks()[0]
      const audioTrack = stream.getAudioTracks()[0]
      if (!videoTrack || !audioTrack) throw new Error('Both media tracks are required')
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
      const ended = () => {
        setMediaReady(false)
        setMediaError('Camera or microphone access ended. Restore access to continue viewing the exam.')
        void queueEvent('media_ended', { track: 'camera_or_microphone' })
      }
      videoTrack.addEventListener('ended', ended, { once: true })
      audioTrack.addEventListener('ended', ended, { once: true })
      setMediaReady(true)
    } catch {
      setMediaReady(false)
      setMediaError('Camera and microphone permission is required throughout the exam.')
      await queueEvent('media_permission_denied')
    }
  }, [queueEvent, stopMedia])

  const saveAnswer = useCallback(async (questionId: string, value: { selectedOptionId?: string; text?: string }) => {
    try {
      const response = await fetch(`/api/attempts/${attemptId}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId, ...value }),
      })
      if (!response.ok) {
        const result = await response.json().catch(() => ({ error: 'Answer save failed' }))
        throw new Error(result.error)
      }
      setConnectionError('')
    } catch {
      setConnectionError('An answer could not be saved. Check your connection before submitting.')
    }
  }, [attemptId])

  const submit = useCallback(async () => {
    if (submittingRef.current || status !== 'in_progress') return
    submittingRef.current = true
    try {
      // Persist the current in-memory values before the database freezes the attempt.
      for (const question of questions) {
        const current = answers[question.id]
        if (!current) continue
        const payload = question.type === 'single_choice'
          ? { questionId: question.id, selectedOptionId: current.selectedOptionId }
          : { questionId: question.id, text: current.text }
        const saveResponse = await fetch(`/api/attempts/${attemptId}/answer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!saveResponse.ok) throw new Error('Could not save all answers. Check your connection and try again.')
      }
      await flushQueue()
      const response = await fetch(`/api/attempts/${attemptId}/submit`, { method: 'POST' })
      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: 'Submission failed' }))
        throw new Error(data.error)
      }
      stopMedia()
      router.replace(`/attempt/${attemptId}/result`)
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : 'Submission failed. Try again.')
      submittingRef.current = false
    }
  }, [answers, attemptId, flushQueue, questions, router, status, stopMedia])

  useEffect(() => {
    void startMedia()
    void flushQueue()
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        void queueEvent('tab_hidden', { at: new Date().toISOString() })
      } else {
        void flushQueue()
        void syncStatus()
      }
    }
    const onOnline = () => void flushQueue()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('online', onOnline)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('online', onOnline)
      stopMedia()
    }
  }, [flushQueue, queueEvent, startMedia, stopMedia, syncStatus])

  useEffect(() => {
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000))
      setSecondsLeft(remaining)
      if (remaining === 0) void submit()
    }, 1000)
    return () => window.clearInterval(timer)
  }, [expiresAt, submit])

  useEffect(() => {
    const heartbeat = window.setInterval(() => void syncStatus(), 15000)
    return () => window.clearInterval(heartbeat)
  }, [syncStatus])

  const time = `${String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:${String(secondsLeft % 60).padStart(2, '0')}`

  if (status === 'disqualified') {
    return <div className="blocking"><div><span className="badge red">Disqualified</span><h2 style={{ marginTop: 14 }}>This attempt has been disqualified.</h2><p className="muted">Three tab-switch violations were confirmed by the server.</p></div></div>
  }

  return (
    <div className="exam-shell">
      <section className="stack">
        <div className="page-head">
          <div><div className="eyebrow">Exam in progress</div><h2 style={{ marginTop: 8 }}>{examTitle}</h2></div>
        </div>
        {!mediaReady && (
          <div className="alert">
            <strong>Exam content is paused because media access is not active.</strong><br />{mediaError}
            <div style={{ marginTop: 10 }}><button className="btn btn-danger" onClick={() => void startMedia()}>Restore camera & microphone</button></div>
          </div>
        )}
        {connectionError && <div className="alert">{connectionError}</div>}
        <div style={{ visibility: mediaReady ? 'visible' : 'hidden', pointerEvents: mediaReady ? 'auto' : 'none' }} className="stack">
          {questions.map((question, index) => {
            const current = answers[question.id] || { selectedOptionId: '', text: '' }
            return (
              <article className="question" key={question.id}>
                <div className="actions" style={{ justifyContent: 'space-between' }}>
                  <span className="badge">Question {index + 1}</span>
                  <span className="small muted">{question.points} point{question.points === 1 ? '' : 's'}</span>
                </div>
                <h3 style={{ marginTop: 16 }}>{question.prompt}</h3>
                {question.type === 'single_choice' ? (
                  <div>
                    {(question.question_options || []).map((option) => (
                      <label className="option" key={option.id}>
                        <input
                          type="radio"
                          name={question.id}
                          value={option.id}
                          checked={current.selectedOptionId === option.id}
                          onChange={() => {
                            setAnswers((all) => ({ ...all, [question.id]: { ...current, selectedOptionId: option.id } }))
                            void saveAnswer(question.id, { selectedOptionId: option.id })
                          }}
                        />
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <textarea
                    className="textarea"
                    value={current.text}
                    placeholder="Type your answer…"
                    onChange={(event) => setAnswers((all) => ({ ...all, [question.id]: { ...current, text: event.target.value } }))}
                    onBlur={() => void saveAnswer(question.id, { text: (answers[question.id] || current).text })}
                  />
                )}
              </article>
            )
          })}
          <div className="card actions" style={{ justifyContent: 'space-between' }}>
            <span className="muted small">Confirm your answers before final submission.</span>
            <button className="btn btn-primary" onClick={() => void submit()}>Submit exam</button>
          </div>
        </div>
      </section>

      <aside className="exam-side stack">
        <div className="card">
          <div className="small muted">Time remaining</div>
          <div className="timer" aria-live="polite">{time}</div>
        </div>
        <div className="card">
          <div className="actions" style={{ justifyContent: 'space-between' }}><strong>Proctoring</strong><span className="badge">Live</span></div>
          <video ref={videoRef} className="camera" autoPlay muted playsInline style={{ marginTop: 12 }} />
          <p className="small muted">Camera and microphone must remain active. Media is not recorded by this starter.</p>
          <div className="divider" />
          <div className="small muted">Tab violations</div>
          <div className="violation-dots" aria-label={`${violationCount} of 3 violations`} style={{ marginTop: 8 }}>
            {[0, 1, 2].map((index) => <span key={index} className={`violation-dot ${index < violationCount ? 'active' : ''}`} />)}
          </div>
          <p className="small muted">3 confirmed violations = automatic disqualification.</p>
        </div>
      </aside>
    </div>
  )
}
