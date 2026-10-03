'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function ExamLaunch({ examId }: { examId: string }) {
  const router = useRouter()
  const [acknowledged, setAcknowledged] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function start() {
    if (!acknowledged || busy) return
    setBusy(true)
    setMessage('')
    let stream: MediaStream | null = null

    try {
      // Request media only when the candidate actually starts the exam.
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      const cameraOk = stream.getVideoTracks().some((track) => track.readyState === 'live')
      const micOk = stream.getAudioTracks().some((track) => track.readyState === 'live')
      if (!cameraOk || !micOk) throw new Error('Both camera and microphone are required.')

      const response = await fetch('/api/attempts/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ examId }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to start exam.')

      // The exam page immediately reacquires the stream and owns it for the attempt lifetime.
      stream.getTracks().forEach((track) => track.stop())
      router.replace(`/attempt/${result.attemptId}`)
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop())
      setMessage(error instanceof Error ? error.message : 'Camera and microphone access is required.')
      setBusy(false)
    }
  }

  return (
    <div className="stack">
      <label className="option">
        <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />
        <span>I have read the exam requirements, Privacy Policy, and Terms. I understand that camera and microphone access is required and that three confirmed hidden-tab events disqualify the attempt.</span>
      </label>
      {message && <div className="alert" role="status">{message}</div>}
      <button className="btn btn-primary" type="button" disabled={!acknowledged || busy} onClick={start}>
        {busy ? 'Starting exam…' : 'Start exam and enable camera + microphone'}
      </button>
    </div>
  )
}
