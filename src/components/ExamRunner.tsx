'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { AttemptStatus, Question } from '@/lib/types'
import { createBrowserFaceDetector, type BrowserFaceDetector } from '@/lib/faceMonitor'

type SavedAnswer = { question_id: string; selected_option_id: string | null; text_answer: string | null }
type PendingEvent = { eventId: string; type: string; details: Record<string, unknown> }
type PendingAnswer = {
  questionId: string
  selectedOptionId: string | null
  text: string | null
  revision: string
}
type AnswerValue = { selectedOptionId: string; text: string }
type SaveState = 'saved' | 'saving' | 'offline' | 'error'
type FaceWarningType = 'face_missing_warning' | 'multiple_faces_warning'
type EventDelivery = 'sent' | 'retry' | 'discard'
type FaceWarning = { type: FaceWarningType; count: number }

const FACE_WARNING_LIMIT = 4
const FACE_WARNING_WINDOW_MS = 10_000
const FACE_SAMPLE_INTERVAL_MS = 750

type Props = {
  attemptId: string
  examTitle: string
  expiresAt: string
  initialViolationCount: number
  initialFaceViolationCount: number
  questions: Question[]
  initialAnswers: SavedAnswer[]
}

export function ExamRunner({ attemptId, examTitle, expiresAt, initialViolationCount, initialFaceViolationCount, questions, initialAnswers }: Props) {
  const router = useRouter()
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const faceDetectorRef = useRef<BrowserFaceDetector | null>(null)
  const faceConditionRef = useRef<{ type: FaceWarningType | null; startedAt: number }>({ type: null, startedAt: 0 })
  const faceWarningTimerRef = useRef<number | null>(null)
  const faceDetectorErrorCountRef = useRef(0)
  const faceDetectorErrorReportedRef = useRef(false)
  const mediaEverReadyRef = useRef(false)
  const statusRef = useRef<AttemptStatus>('in_progress')
  const faceViolationCountRef = useRef(initialFaceViolationCount)
  const submittingRef = useRef(false)
  const textSaveTimers = useRef<Record<string, number>>({})
  const answersRef = useRef<Record<string, AnswerValue>>({})
  const secondsLeftRef = useRef(0)

  const [mediaReady, setMediaReady] = useState(false)
  const [mediaError, setMediaError] = useState('')
  const [connectionError, setConnectionError] = useState('')
  const [violationCount, setViolationCount] = useState(initialViolationCount)
  const [faceViolationCount, setFaceViolationCount] = useState(initialFaceViolationCount)
  const [faceWarning, setFaceWarning] = useState<FaceWarning | null>(null)
  const [status, setStatus] = useState<AttemptStatus>('in_progress')
  const [submitting, setSubmitting] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [pendingCount, setPendingCount] = useState(0)
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)),
  )
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>(() => {
    const mapped: Record<string, AnswerValue> = {}
    for (const answer of initialAnswers) {
      mapped[answer.question_id] = {
        selectedOptionId: answer.selected_option_id || '',
        text: answer.text_answer || '',
      }
    }
    return mapped
  })

  const eventQueueKey = useMemo(() => `examcore:events:${attemptId}`, [attemptId])
  const answerQueueKey = useMemo(() => `examcore:answers:${attemptId}`, [attemptId])

  useEffect(() => {
    answersRef.current = answers
  }, [answers])

  useEffect(() => {
    secondsLeftRef.current = secondsLeft
  }, [secondsLeft])

  useEffect(() => {
    statusRef.current = status
  }, [status])

  useEffect(() => {
    faceViolationCountRef.current = faceViolationCount
  }, [faceViolationCount])

  const stopMedia = useCallback(() => {
    faceDetectorRef.current?.close?.()
    faceDetectorRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    faceConditionRef.current = { type: null, startedAt: 0 }
  }, [])

  const readPendingAnswers = useCallback((): Record<string, PendingAnswer> => {
    try {
      const raw = localStorage.getItem(answerQueueKey)
      return raw ? JSON.parse(raw) as Record<string, PendingAnswer> : {}
    } catch {
      return {}
    }
  }, [answerQueueKey])

  const writePendingAnswers = useCallback((pending: Record<string, PendingAnswer>) => {
    try {
      localStorage.setItem(answerQueueKey, JSON.stringify(pending))
    } catch {
      // In-memory state still keeps the current answer if storage is unavailable.
    }
    setPendingCount(Object.keys(pending).length)
  }, [answerQueueKey])

  const clearPendingAnswers = useCallback(() => {
    try {
      localStorage.removeItem(answerQueueKey)
    } catch {
      // Ignore restrictive storage environments.
    }
    setPendingCount(0)
    setSaveState('saved')
  }, [answerQueueKey])

  const savePendingAnswer = useCallback(async (entry: PendingAnswer) => {
    if (!navigator.onLine) {
      setSaveState('offline')
      return false
    }

    setSaveState('saving')
    try {
      const response = await fetch(`/api/attempts/${attemptId}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionId: entry.questionId,
          selectedOptionId: entry.selectedOptionId,
          text: entry.text,
        }),
        keepalive: true,
      })
      if (!response.ok) {
        const result = await response.json().catch(() => ({ error: 'Answer save failed' }))
        throw new Error(result.error)
      }

      const current = readPendingAnswers()
      if (current[entry.questionId]?.revision === entry.revision) {
        delete current[entry.questionId]
        writePendingAnswers(current)
      }

      setLastSavedAt(new Date())
      setConnectionError('')
      setSaveState(Object.keys(current).length ? 'saving' : 'saved')
      return true
    } catch {
      setSaveState(navigator.onLine ? 'error' : 'offline')
      setConnectionError('Some answers are waiting to sync. They are kept on this device and will retry automatically.')
      return false
    }
  }, [attemptId, readPendingAnswers, writePendingAnswers])

  const flushAnswers = useCallback(async () => {
    const pending = readPendingAnswers()
    const entries = Object.values(pending)
    if (!entries.length) {
      setSaveState('saved')
      return
    }
    if (!navigator.onLine) {
      setSaveState('offline')
      return
    }

    setSaveState('saving')
    for (const entry of entries) {
      const ok = await savePendingAnswer(entry)
      if (!ok && !navigator.onLine) break
    }
  }, [readPendingAnswers, savePendingAnswer])

  const flushQuestion = useCallback(async (questionId: string) => {
    const entry = readPendingAnswers()[questionId]
    if (entry) await savePendingAnswer(entry)
  }, [readPendingAnswers, savePendingAnswer])

  const stageAnswer = useCallback((
    questionId: string,
    value: { selectedOptionId?: string | null; text?: string | null },
    saveImmediately: boolean,
  ) => {
    const entry: PendingAnswer = {
      questionId,
      selectedOptionId: value.selectedOptionId ?? null,
      text: value.text ?? null,
      revision: crypto.randomUUID(),
    }
    const pending = readPendingAnswers()
    pending[questionId] = entry
    writePendingAnswers(pending)
    setSaveState(navigator.onLine ? 'saving' : 'offline')
    if (saveImmediately) void savePendingAnswer(entry)
  }, [readPendingAnswers, savePendingAnswer, writePendingAnswers])

  const scheduleTextSave = useCallback((questionId: string) => {
    const existing = textSaveTimers.current[questionId]
    if (existing) window.clearTimeout(existing)

    textSaveTimers.current[questionId] = window.setTimeout(() => {
      void flushQuestion(questionId)
      delete textSaveTimers.current[questionId]
    }, 650)
  }, [flushQuestion])

  const saveEventQueue = useCallback((events: PendingEvent[]) => {
    try {
      localStorage.setItem(eventQueueKey, JSON.stringify(events))
    } catch {
      // Storage may be unavailable in restrictive browser modes.
    }
  }, [eventQueueKey])

  const readEventQueue = useCallback((): PendingEvent[] => {
    try {
      const raw = localStorage.getItem(eventQueueKey)
      return raw ? JSON.parse(raw) as PendingEvent[] : []
    } catch {
      return []
    }
  }, [eventQueueKey])

  const showFaceWarning = useCallback((type: FaceWarningType, count: number) => {
    if (count < 1) return
    if (faceWarningTimerRef.current) window.clearTimeout(faceWarningTimerRef.current)
    setFaceWarning({ type, count })
    faceWarningTimerRef.current = window.setTimeout(() => {
      setFaceWarning(null)
      faceWarningTimerRef.current = null
    }, 8000)
  }, [])

  const sendEvent = useCallback(async (event: PendingEvent): Promise<EventDelivery> => {
    try {
      const response = await fetch(`/api/attempts/${attemptId}/event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
        keepalive: true,
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) {
          return 'discard'
        }
        throw new Error('event rejected')
      }

      const nextStatus = data.status as AttemptStatus
      statusRef.current = nextStatus
      setStatus(nextStatus)
      setViolationCount(Number(data.violationCount) || 0)

      if (typeof data.faceViolationCount === 'number') {
        faceViolationCountRef.current = data.faceViolationCount
        setFaceViolationCount(data.faceViolationCount)
        if (
          (event.type === 'face_missing_warning' || event.type === 'multiple_faces_warning')
          && data.faceViolationCount > 0
        ) {
          showFaceWarning(event.type, data.faceViolationCount)
        }
      }

      return 'sent'
    } catch {
      return 'retry'
    }
  }, [attemptId, showFaceWarning])

  const queueEvent = useCallback(async (type: string, details: Record<string, unknown> = {}) => {
    if (statusRef.current !== 'in_progress') return

    const event: PendingEvent = { eventId: crypto.randomUUID(), type, details }
    const queue = [...readEventQueue(), event]
    saveEventQueue(queue)

    if (type === 'tab_hidden') setViolationCount((count) => Math.min(3, count + 1))

    if (type === 'face_missing_warning' || type === 'multiple_faces_warning') {
      const optimisticCount = Math.min(FACE_WARNING_LIMIT, faceViolationCountRef.current + 1)
      faceViolationCountRef.current = optimisticCount
      setFaceViolationCount(optimisticCount)
      showFaceWarning(type, optimisticCount)
    }

    const delivery = await sendEvent(event)
    if (delivery !== 'retry') {
      saveEventQueue(readEventQueue().filter((item) => item.eventId !== event.eventId))
    }
  }, [readEventQueue, saveEventQueue, sendEvent, showFaceWarning])

  const flushEventQueue = useCallback(async () => {
    const queue = readEventQueue()
    if (!queue.length) return

    const remaining: PendingEvent[] = []
    for (const event of queue) {
      if (statusRef.current !== 'in_progress') break
      const delivery = await sendEvent(event)
      if (delivery === 'retry') remaining.push(event)
    }
    saveEventQueue(statusRef.current === 'in_progress' ? remaining : [])
  }, [readEventQueue, saveEventQueue, sendEvent])

  const syncStatus = useCallback(async () => {
    try {
      const response = await fetch(`/api/attempts/${attemptId}/status`, { cache: 'no-store' })
      if (!response.ok) return
      const data = await response.json()
      setViolationCount(data.violationCount)
      if (typeof data.faceViolationCount === 'number') {
        faceViolationCountRef.current = data.faceViolationCount
        setFaceViolationCount(data.faceViolationCount)
      }
      statusRef.current = data.status
      setStatus(data.status)
      if (data.status !== 'in_progress') {
        clearPendingAnswers()
        stopMedia()
        router.replace(`/attempt/${attemptId}/result`)
      }
    } catch {
      // Autosave state already tells the student when connectivity is interrupted.
    }
  }, [attemptId, clearPendingAnswers, router, stopMedia])

  const startMedia = useCallback(async () => {
    setMediaReady(false)
    setMediaError('')
    stopMedia()

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    } catch {
      setMediaError('Camera and microphone permission is required throughout the exam.')
      await queueEvent('media_permission_denied')
      return
    }

    const videoTrack = stream.getVideoTracks()[0]
    const audioTrack = stream.getAudioTracks()[0]
    if (!videoTrack || !audioTrack) {
      stream.getTracks().forEach((track) => track.stop())
      setMediaError('Both camera and microphone are required throughout the exam.')
      await queueEvent('media_permission_denied', { reason: 'missing_track' })
      return
    }

    streamRef.current = stream
    if (videoRef.current) {
      videoRef.current.srcObject = stream
      await videoRef.current.play().catch(() => undefined)
    }

    const ended = (track: 'camera' | 'microphone') => {
      setMediaReady(false)
      faceDetectorRef.current?.close?.()
      faceDetectorRef.current = null
      setMediaError('Camera or microphone access ended. Restore access to continue.')
      void queueEvent('media_ended', { track })
    }
    videoTrack.addEventListener('ended', () => ended('camera'), { once: true })
    audioTrack.addEventListener('ended', () => ended('microphone'), { once: true })

    try {
      const detector = await createBrowserFaceDetector()
      if (videoTrack.readyState !== 'live' || audioTrack.readyState !== 'live') {
        detector.close?.()
        throw new Error('media ended while face monitor was loading')
      }
      faceDetectorRef.current = detector
      faceDetectorErrorCountRef.current = 0
      faceDetectorErrorReportedRef.current = false
      mediaEverReadyRef.current = true
      setMediaReady(true)
    } catch {
      stream.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      setMediaReady(false)
      setMediaError('Face monitoring could not start. Check your connection and restore access.')
      await queueEvent('face_monitor_error', { stage: 'initialization' })
    }
  }, [queueEvent, stopMedia])

  const submit = useCallback(async () => {
    if (submittingRef.current || status !== 'in_progress') return
    if (!navigator.onLine) {
      setSaveState('offline')
      setConnectionError('You are offline. Your answers are stored on this device and submission will retry when the connection returns.')
      return
    }

    submittingRef.current = true
    setSubmitting(true)
    setConnectionError('')

    try {
      Object.values(textSaveTimers.current).forEach((timer) => window.clearTimeout(timer))
      textSaveTimers.current = {}

      const snapshot = { ...answersRef.current }
      for (const pending of Object.values(readPendingAnswers())) {
        snapshot[pending.questionId] = {
          selectedOptionId: pending.selectedOptionId || '',
          text: pending.text || '',
        }
      }

      const finalAnswers = questions.map((question) => {
        const current = snapshot[question.id] || { selectedOptionId: '', text: '' }
        return question.type === 'single_choice'
          ? { questionId: question.id, selectedOptionId: current.selectedOptionId || null, text: null }
          : { questionId: question.id, selectedOptionId: null, text: current.text }
      })

      await flushEventQueue()

      const response = await fetch(`/api/attempts/${attemptId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: finalAnswers }),
      })
      const data = await response.json().catch(() => ({ error: 'Submission failed' }))
      if (!response.ok) throw new Error(data.error || 'Submission failed')

      clearPendingAnswers()
      setStatus(data.status || 'submitted')
      stopMedia()
      router.replace(`/attempt/${attemptId}/result`)
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : 'Submission failed. It will retry when possible.')
      submittingRef.current = false
      setSubmitting(false)
    }
  }, [attemptId, clearPendingAnswers, flushEventQueue, questions, readPendingAnswers, router, status, stopMedia])

  useEffect(() => {
    const validIds = new Set(questions.map((question) => question.id))
    const stored = readPendingAnswers()
    const pending: Record<string, PendingAnswer> = {}

    for (const [questionId, entry] of Object.entries(stored)) {
      if (validIds.has(questionId)) pending[questionId] = entry
    }

    writePendingAnswers(pending)
    if (Object.keys(pending).length) {
      setAnswers((current) => {
        const next = { ...current }
        for (const entry of Object.values(pending)) {
          next[entry.questionId] = {
            selectedOptionId: entry.selectedOptionId || '',
            text: entry.text || '',
          }
        }
        return next
      })
      setSaveState(navigator.onLine ? 'saving' : 'offline')
      void flushAnswers()
    }
  }, [flushAnswers, questions, readPendingAnswers, writePendingAnswers])

  useEffect(() => {
    void startMedia()
    void flushEventQueue()

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        void queueEvent('tab_hidden', { at: new Date().toISOString() })
      } else {
        void flushAnswers()
        void flushEventQueue()
        void syncStatus()
      }
    }

    const onOnline = () => {
      void flushAnswers()
      void flushEventQueue()
      if (secondsLeftRef.current === 0) void submit()
    }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('online', onOnline)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('online', onOnline)
      Object.values(textSaveTimers.current).forEach((timer) => window.clearTimeout(timer))
      if (faceWarningTimerRef.current) window.clearTimeout(faceWarningTimerRef.current)
      stopMedia()
    }
  }, [flushAnswers, flushEventQueue, queueEvent, startMedia, stopMedia, submit, syncStatus])

  useEffect(() => {
    if (status !== 'in_progress' || !mediaEverReadyRef.current) return

    let stopped = false
    let timer: number | null = null

    const resetCondition = () => {
      faceConditionRef.current = { type: null, startedAt: 0 }
    }

    const schedule = () => {
      if (!stopped) timer = window.setTimeout(runDetection, FACE_SAMPLE_INTERVAL_MS)
    }

    const runDetection = () => {
      if (stopped || statusRef.current !== 'in_progress') return

      if (document.visibilityState !== 'visible') {
        resetCondition()
        schedule()
        return
      }

      let warningType: FaceWarningType | null = null
      let faceCount = 0

      if (!mediaReady) {
        warningType = 'face_missing_warning'
      } else {
        const detector = faceDetectorRef.current
        const video = videoRef.current

        if (!detector || !video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
          resetCondition()
          schedule()
          return
        }

        try {
          const result = detector.detectForVideo(video, performance.now())
          faceCount = result.detections?.length ?? 0
          faceDetectorErrorCountRef.current = 0
          faceDetectorErrorReportedRef.current = false

          if (faceCount === 0) warningType = 'face_missing_warning'
          else if (faceCount > 1) warningType = 'multiple_faces_warning'
        } catch {
          faceDetectorErrorCountRef.current += 1
          resetCondition()
          if (faceDetectorErrorCountRef.current >= 3 && !faceDetectorErrorReportedRef.current) {
            faceDetectorErrorReportedRef.current = true
            void queueEvent('face_monitor_error', { stage: 'inference' })
          }
          schedule()
          return
        }
      }

      if (!warningType) {
        resetCondition()
        schedule()
        return
      }

      const now = Date.now()
      if (faceConditionRef.current.type !== warningType) {
        faceConditionRef.current = { type: warningType, startedAt: now }
      } else if (now - faceConditionRef.current.startedAt >= FACE_WARNING_WINDOW_MS) {
        faceConditionRef.current = { type: warningType, startedAt: now }
        void queueEvent(warningType, {
          faceCount,
          durationMs: FACE_WARNING_WINDOW_MS,
          detector: 'mediapipe_blazeface_short_range',
        })
      }

      schedule()
    }

    const onVisibility = () => {
      if (document.visibilityState !== 'visible') resetCondition()
    }

    document.addEventListener('visibilitychange', onVisibility)
    schedule()

    return () => {
      stopped = true
      if (timer) window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      resetCondition()
    }
  }, [mediaReady, queueEvent, status])

  useEffect(() => {
    const autosave = window.setInterval(() => {
      void flushAnswers()
    }, 5000)
    return () => window.clearInterval(autosave)
  }, [flushAnswers])

  useEffect(() => {
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000))
      setSecondsLeft(remaining)
      if (remaining === 0 && navigator.onLine) void submit()
    }, 1000)

    return () => window.clearInterval(timer)
  }, [expiresAt, submit])

  useEffect(() => {
    const heartbeat = window.setInterval(() => void syncStatus(), 15000)
    return () => window.clearInterval(heartbeat)
  }, [syncStatus])

  const time = `${String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:${String(secondsLeft % 60).padStart(2, '0')}`
  const answeredCount = questions.filter((question) => {
    const current = answers[question.id]
    return question.type === 'single_choice'
      ? Boolean(current?.selectedOptionId)
      : Boolean(current?.text.trim())
  }).length

  const saveLabel = saveState === 'offline'
    ? `Offline · ${pendingCount} queued`
    : saveState === 'error'
      ? `Retrying ${pendingCount} save${pendingCount === 1 ? '' : 's'}`
      : saveState === 'saving'
        ? `Saving${pendingCount ? ` ${pendingCount}` : ''}…`
        : lastSavedAt
          ? `Saved ${lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
          : 'Saved'

  if (status === 'disqualified') {
    return (
      <div className="blocking">
        <div className="card blocking-card">
          <span className="badge red">Disqualified</span>
          <h2>This attempt has ended.</h2>
          <p className="muted">The configured proctoring violation limit was reached.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="exam-shell">
      <section className="stack">
        <div className="exam-topbar">
          <div>
            <div className="eyebrow">Exam in progress</div>
            <h1 className="exam-title">{examTitle}</h1>
            <div className="actions">
              <span className={saveState === 'error' || saveState === 'offline' ? 'badge red' : 'badge'}>{saveLabel}</span>
              <span className="badge black">{answeredCount} / {questions.length} answered</span>
            </div>
          </div>
          <div className="mobile-timer" aria-label="Time remaining">{time}</div>
        </div>

        {!mediaReady && (
          <div className="alert">
            <strong>Camera and microphone access is paused.</strong>
            <span>{mediaError}</span>
            <button className="btn btn-danger" onClick={() => void startMedia()}>Restore access</button>
          </div>
        )}

        {connectionError && <div className="alert">{connectionError}</div>}

        {faceWarning && (
          <div className="alert" role="alert">
            <strong>Proctoring warning {faceWarning.count} of {FACE_WARNING_LIMIT}</strong>
            <span>
              {faceWarning.type === 'face_missing_warning'
                ? 'No face was detected continuously for more than 10 seconds. Keep your face clearly visible to the camera.'
                : 'More than one face was detected continuously for more than 10 seconds. Only the candidate may remain in view.'}
            </span>
          </div>
        )}

        <div
          className="stack"
          style={{ visibility: mediaReady ? 'visible' : 'hidden', pointerEvents: mediaReady && secondsLeft > 0 ? 'auto' : 'none' }}
          aria-hidden={!mediaReady}
        >
          {questions.map((question, index) => {
            const current = answers[question.id] || { selectedOptionId: '', text: '' }

            return (
              <article className="question" key={question.id}>
                <div className="actions question-meta">
                  <span className="question-number">Question {index + 1}</span>
                  <span className="small muted">{question.points} point{question.points === 1 ? '' : 's'}</span>
                </div>
                <h3>{question.prompt}</h3>

                {question.type === 'single_choice' ? (
                  <div className="option-list">
                    {(question.question_options || []).map((option) => (
                      <label className="option" key={option.id}>
                        <input
                          type="radio"
                          name={question.id}
                          value={option.id}
                          checked={current.selectedOptionId === option.id}
                          onChange={() => {
                            setAnswers((all) => ({
                              ...all,
                              [question.id]: {
                                selectedOptionId: option.id,
                                text: all[question.id]?.text || '',
                              },
                            }))
                            stageAnswer(question.id, { selectedOptionId: option.id, text: null }, true)
                          }}
                        />
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <textarea
                    className="textarea exam-textarea"
                    value={current.text}
                    placeholder="Type your answer"
                    onChange={(event) => {
                      const text = event.target.value
                      setAnswers((all) => ({
                        ...all,
                        [question.id]: {
                          selectedOptionId: all[question.id]?.selectedOptionId || '',
                          text,
                        },
                      }))
                      stageAnswer(question.id, { selectedOptionId: null, text }, false)
                      scheduleTextSave(question.id)
                    }}
                    onBlur={() => void flushQuestion(question.id)}
                  />
                )}
              </article>
            )
          })}

          <div className="submit-bar">
            <span className="muted small">
              {secondsLeft === 0
                ? 'Time is up. Finalizing your saved answers…'
                : 'Your latest answers are included atomically when you submit.'}
            </span>
            <button
              className="btn btn-primary"
              disabled={submitting || secondsLeft === 0}
              onClick={() => void submit()}
            >
              {submitting ? 'Submitting…' : 'Submit exam'}
            </button>
          </div>
        </div>
      </section>

      <aside className="exam-side stack">
        <div className="card timer-card">
          <div className="small muted">Time remaining</div>
          <div className="timer" aria-live="polite">{time}</div>
        </div>

        <div className="card proctor-card">
          <div className="actions proctor-heading">
            <strong>Exam monitor</strong>
            <span className={mediaReady ? 'badge' : 'badge red'}>{mediaReady ? 'Active' : 'Paused'}</span>
          </div>
          <video ref={videoRef} className="camera" autoPlay muted playsInline />
          <div className="divider" />
          <div className="small muted">Tab violations</div>
          <div className="violation-dots" aria-label={`${violationCount} of 3 violations`}>
            {[0, 1, 2].map((index) => (
              <span key={index} className={`violation-dot ${index < violationCount ? 'active' : ''}`} />
            ))}
          </div>
          <p className="small muted proctor-note">Three confirmed tab violations end the attempt.</p>
          {faceViolationCount > 0 && (
            <>
              <div className="divider" />
              <div className="small muted">Face-monitor warnings</div>
              <div className="violation-dots" aria-label={`${faceViolationCount} of ${FACE_WARNING_LIMIT} face-monitor warnings`}>
                {[0, 1, 2, 3].map((index) => (
                  <span key={index} className={`violation-dot ${index < faceViolationCount ? 'active' : ''}`} />
                ))}
              </div>
              <p className="small muted proctor-note">Four face-monitor warnings end the attempt.</p>
            </>
          )}
        </div>
      </aside>
    </div>
  )
}
