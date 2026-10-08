'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Option = { label: string; is_correct: boolean }
type BuilderQuestion = { prompt: string; type: 'single_choice' | 'short_text'; points: number; options: Option[] }

const blankMcq = (): BuilderQuestion => ({
  prompt: '', type: 'single_choice', points: 1,
  options: [{ label: '', is_correct: true }, { label: '', is_correct: false }],
})

export function ExamBuilder() {
  const router = useRouter()
  const [questions, setQuestions] = useState<BuilderQuestion[]>([blankMcq()])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function patchQuestion(index: number, patch: Partial<BuilderQuestion>) {
    setQuestions((items) => items.map((item, i) => i === index ? { ...item, ...patch } : item))
  }

  function patchOption(qIndex: number, oIndex: number, patch: Partial<Option>) {
    setQuestions((items) => items.map((question, i) => {
      if (i !== qIndex) return question
      const options = question.options.map((option, j) => {
        if (patch.is_correct === true) return { ...option, ...(j === oIndex ? patch : { is_correct: false }) }
        return j === oIndex ? { ...option, ...patch } : option
      })
      return { ...question, options }
    }))
  }

  async function submit(formData: FormData) {
    setBusy(true)
    setError('')
    const payload = {
      title: String(formData.get('title') || ''),
      description: String(formData.get('description') || ''),
      duration_minutes: Number(formData.get('duration') || 0),
      starts_at: formData.get('startsAt') ? new Date(String(formData.get('startsAt'))).toISOString() : '',
      ends_at: formData.get('endsAt') ? new Date(String(formData.get('endsAt'))).toISOString() : '',
      questions: questions.map((question) => ({
        ...question,
        prompt: question.prompt.trim(),
        options: question.type === 'single_choice' ? question.options.map((o) => ({ ...o, label: o.label.trim() })) : [],
      })),
    }

    const response = await fetch('/api/admin/exams', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })
    const data = await response.json().catch(() => ({ error: 'Could not create exam' }))
    if (!response.ok) {
      setError(data.error || 'Could not create exam')
      setBusy(false)
      return
    }
    router.replace('/admin/exams/' + data.examId + '/schedule')
    router.refresh()
  }

  return (
    <form className="stack" action={submit}>
      <div className="card form">
        <div className="field"><label>Exam title</label><input className="input" name="title" minLength={3} maxLength={160} required /></div>
        <div className="field"><label>Description</label><textarea className="textarea" name="description" /></div>
        <div className="grid grid-3">
          <div className="field"><label>Duration (minutes)</label><input className="input" name="duration" type="number" min={1} max={600} defaultValue={60} required /></div>
          <div className="field"><label>Starts at (optional)</label><input className="input" name="startsAt" type="datetime-local" /></div>
          <div className="field"><label>Ends at (optional)</label><input className="input" name="endsAt" type="datetime-local" /></div>
        </div>
      </div>

      {questions.map((question, qIndex) => (
        <div className="card form" key={qIndex}>
          <div className="actions" style={{ justifyContent: 'space-between' }}>
            <strong>Question {qIndex + 1}</strong>
            {questions.length > 1 && <button className="btn btn-secondary" type="button" onClick={() => setQuestions((items) => items.filter((_, i) => i !== qIndex))}>Remove</button>}
          </div>
          <div className="field"><label>Prompt</label><textarea className="textarea" value={question.prompt} onChange={(e) => patchQuestion(qIndex, { prompt: e.target.value })} required /></div>
          <div className="grid grid-2">
            <div className="field"><label>Type</label><select className="select" value={question.type} onChange={(e) => patchQuestion(qIndex, { type: e.target.value as BuilderQuestion['type'], options: e.target.value === 'single_choice' ? (question.options.length ? question.options : blankMcq().options) : [] })}><option value="single_choice">Single choice</option><option value="short_text">Written answer</option></select></div>
            <div className="field"><label>Points</label><input className="input" type="number" min="0.5" max="1000" step="0.5" value={question.points} onChange={(e) => patchQuestion(qIndex, { points: Number(e.target.value) })} /></div>
          </div>
          {question.type === 'single_choice' && (
            <div className="stack">
              <strong className="small">Options (select the correct answer)</strong>
              {question.options.map((option, oIndex) => (
                <div className="actions" key={oIndex}>
                  <input type="radio" name={`correct-${qIndex}`} checked={option.is_correct} onChange={() => patchOption(qIndex, oIndex, { is_correct: true })} aria-label={`Mark option ${oIndex + 1} correct`} />
                  <input className="input" value={option.label} onChange={(e) => patchOption(qIndex, oIndex, { label: e.target.value })} placeholder={`Option ${oIndex + 1}`} required />
                  {question.options.length > 2 && <button className="btn btn-secondary" type="button" onClick={() => patchQuestion(qIndex, { options: question.options.filter((_, i) => i !== oIndex) })}>×</button>}
                </div>
              ))}
              <button className="btn btn-secondary" type="button" onClick={() => patchQuestion(qIndex, { options: [...question.options, { label: '', is_correct: false }] })}>Add option</button>
            </div>
          )}
        </div>
      ))}

      {error && <div className="alert">{error}</div>}
      <div className="actions">
        <button className="btn btn-secondary" type="button" onClick={() => setQuestions((items) => [...items, blankMcq()])}>Add question</button>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Create draft exam'}</button>
      </div>
    </form>
  )
}
