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
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'user' },
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 15, max: 24 },
        },
        audio: true,
      })
      const cameraOk = stream.getVideoTracks().some((track) => track.readyState === 'live')
      const micOk = stream.getAudioTracks().some((track) => track.readyState === 'live')
      if (!cameraOk || !micOk) throw new Error('Both camera and microphone are required.')

      const response = await fetch('/api/attempts/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ examId }),
      })
      const result = await response.json().catch(() => ({ error: 'Unable to start exam.' }))
      if (!response.ok) throw new Error(result.error || 'Unable to start exam.')

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
      <label className="consent-row">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(event) => setAcknowledged(event.target.checked)}
        />
        <span>
          I understand the exam rules and agree to keep camera and microphone access active throughout the attempt. Automated face monitoring requires exactly one candidate to remain visible; sustained no-face or multiple-face detections can trigger warnings and disqualification.
        </span>
      </label>

      {message && <div className="alert" role="status">{message}</div>}

      <button
        className="btn btn-primary"
        type="button"
        disabled={!acknowledged || busy}
        onClick={() => void start()}
      >
        {busy ? 'Checking devices…' : 'Start exam'}
      </button>
    </div>
  )
}
