'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

type Option = { id: string; label: string; is_correct: boolean }
export type EditableQuestion = {
  id: string
  prompt: string
  type: 'single_choice' | 'short_text'
  points: number
  guidance: string
  options: Option[]
}
export type EditableExam = {
  id: string
  title: string
  description: string
  duration_minutes: number
  starts_at: string | null
  ends_at: string | null
  updated_at: string
}

const newOption = (correct: boolean): Option => ({
  id: crypto.randomUUID(), label: '', is_correct: correct,
})

const newQuestion = (type: EditableQuestion['type'] = 'single_choice'): EditableQuestion => ({
  id: crypto.randomUUID(),
  prompt: '',
  type,
  points: type === 'single_choice' ? 1 : 5,
  guidance: '',
  options: type === 'single_choice' ? [newOption(true), newOption(false)] : [],
})

function localDateTime(value: string | null) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const offset = d.getTimezoneOffset() * 60_000
  return new Date(d.getTime() - offset).toISOString().slice(0, 16)
}

export function ExamEditor({ exam, initialQuestions }: {
  exam: EditableExam
  initialQuestions: EditableQuestion[]
}) {
  const router = useRouter()
  const [questions, setQuestions] = useState<EditableQuestion[]>(initialQuestions)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [version, setVersion] = useState(exam.updated_at)

  function changeQuestion(id: string, patch: Partial<EditableQuestion>) {
    setSaved(false)
    setQuestions((old) => old.map((item) => item.id === id ? { ...item, ...patch } : item))
  }

  function changeOption(questionId: string, optionId: string, patch: Partial<Option>) {
    setSaved(false)
    setQuestions((old) => old.map((q) => {
      if (q.id !== questionId) return q
      return {
        ...q,
        options: q.options.map((o) => ({
          ...o,
          ...(patch.is_correct === true ? { is_correct: o.id === optionId } : {}),
          ...(o.id === optionId ? patch : {}),
        })),
      }
    }))
  }

  function removeOption(questionId: string, optionId: string) {
    setSaved(false)
    setQuestions((old) => old.map((q) => {
      if (q.id !== questionId || q.options.length <= 2) return q
      const kept = q.options.filter((o) => o.id !== optionId)
      if (!kept.some((o) => o.is_correct)) kept[0] = { ...kept[0], is_correct: true }
      return { ...q, options: kept }
    }))
  }

  function moveQuestion(index: number, offset: -1 | 1) {
    const next = index + offset
    if (next < 0 || next >= questions.length) return
    setSaved(false)
    setQuestions((old) => {
      const reordered = [...old]
      const temp = reordered[index]
      reordered[index] = reordered[next]
      reordered[next] = temp
      return reordered
    })
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (busy) return
    const fd = new FormData(e.currentTarget)
    setSaved(false)
    setError('')

    const start = String(fd.get('startsAt') || '')
    const end = String(fd.get('endsAt') || '')
    const startDate = start ? new Date(start) : null
    const endDate = end ? new Date(end) : null

    if ((startDate && Number.isNaN(startDate.getTime())) || (endDate && Number.isNaN(endDate.getTime()))) {
      setError('Enter valid exam start and end dates.')
      return
    }

    if (questions.length < 1 || questions.length > 200 ||
      questions.some((q) => !q.prompt.trim() || !(q.points > 0 && q.points <= 1000) ||
        (q.type === 'single_choice' && (
          q.options.length < 2 || q.options.length > 20 ||
          q.options.filter((o) => o.is_correct).length !== 1 ||
          q.options.some((o) => !o.label.trim())
        )))) {
      setError('Check all question prompts, marks, and multiple-choice answers before saving.')
      return
    }

    const payload = {
      title: String(fd.get('title') || '').trim(),
      description: String(fd.get('description') || ''),
      duration_minutes: Number(fd.get('duration')),
      starts_at: startDate?.toISOString() || null,
      ends_at: endDate?.toISOString() || null,
      expected_updated_at: version,
      questions: questions.map((q) => ({
        prompt: q.prompt.trim(),
        type: q.type,
        points: q.points,
        guidance: q.guidance.trim(),
        options: q.type === 'single_choice'
          ? q.options.map((o) => ({ label: o.label.trim(), is_correct: o.is_correct }))
          : [],
      })),
    }

    setBusy(true)
    try {
      const response = await fetch('/api/admin/exams/' + exam.id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Could not save exam changes.')
      setVersion(String(result.updatedAt))
      setSaved(true)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save exam.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="stack" onSubmit={(e) => void submit(e)}>
      <section className="card form">
        <h2 className="section-heading">Exam details</h2>
        <div className="field">
          <label htmlFor="edit-exam-title">Title</label>
          <input id="edit-exam-title" className="input" name="title" defaultValue={exam.title} minLength={3} maxLength={160} required />
        </div>
        <div className="field">
          <label htmlFor="edit-exam-description">Description</label>
          <textarea id="edit-exam-description" className="textarea" name="description" defaultValue={exam.description} maxLength={10000} />
        </div>
        <div className="grid grid-3">
          <div className="field">
            <label htmlFor="edit-exam-duration">Duration (minutes)</label>
            <input id="edit-exam-duration" className="input" name="duration" type="number" min={1} max={600} step={1} defaultValue={exam.duration_minutes} required />
          </div>
          <div className="field">
            <label htmlFor="edit-exam-start">Exam starts (optional)</label>
            <input id="edit-exam-start" className="input" name="startsAt" type="datetime-local" defaultValue={localDateTime(exam.starts_at)} />
          </div>
          <div className="field">
            <label htmlFor="edit-exam-end">Exam ends (optional)</label>
            <input id="edit-exam-end" className="input" name="endsAt" type="datetime-local" defaultValue={localDateTime(exam.ends_at)} />
          </div>
        </div>
        <p className="muted small">Dates use your device's local time zone. Existing exam slots must still fit the duration and exam window.</p>
      </section>

      <div className="section-title-row">
        <div>
          <div className="eyebrow">Question paper</div>
          <h2 className="section-heading">{questions.length} question{questions.length === 1 ? '' : 's'}</h2>
        </div>
      </div>

      {questions.map((q, index) => (
        <section className="card form" key={q.id}>
          <div className="actions" style={{ justifyContent: 'space-between' }}>
            <strong>Question {index + 1}</strong>
            <div className="actions">
              <button type="button" className="btn btn-secondary" disabled={busy || index === 0}
                onClick={() => moveQuestion(index, -1)} aria-label={'Move question ' + (index + 1) + ' up'}>↑</button>
              <button type="button" className="btn btn-secondary" disabled={busy || index === questions.length - 1}
                onClick={() => moveQuestion(index, 1)} aria-label={'Move question ' + (index + 1) + ' down'}>↓</button>
              <button type="button" className="btn btn-secondary" disabled={busy || questions.length === 1}
                onClick={() => { setSaved(false); setQuestions((old) => old.filter((x) => x.id !== q.id)) }}>Remove</button>
            </div>
          </div>
          <div className="field">
            <label htmlFor={'question-prompt-' + q.id}>Question text</label>
            <textarea id={'question-prompt-' + q.id} className="textarea" value={q.prompt}
              maxLength={5000} required onChange={(e) => changeQuestion(q.id, { prompt: e.target.value })} />
          </div>
          <div className="grid grid-2">
            <div className="field">
              <label htmlFor={'question-type-' + q.id}>Type</label>
              <select id={'question-type-' + q.id} className="select" value={q.type}
                onChange={(e) => {
                  const type = e.target.value as EditableQuestion['type']
                  changeQuestion(q.id, {
                    type,
                    options: type === 'single_choice'
                      ? q.options.length >= 2 ? q.options : [newOption(true), newOption(false)]
                      : [],
                  })
                }}>
                <option value="single_choice">Multiple choice</option>
                <option value="short_text">Written response</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor={'question-points-' + q.id}>Marks</label>
              <input id={'question-points-' + q.id} className="input" type="number" min="0.25" max="1000" step="0.25"
                value={q.points} onChange={(e) => changeQuestion(q.id, { points: Number(e.target.value) })} required />
            </div>
          </div>
          {q.type === 'single_choice' && (
            <div className="stack">
              <strong className="small">Options (mark exactly one correct answer)</strong>
              {q.options.map((option, optionIndex) => (
                <div className="actions" key={option.id}>
                  <input type="radio" name={'answer-' + q.id} checked={option.is_correct}
                    onChange={() => changeOption(q.id, option.id, { is_correct: true })}
                    aria-label={'Mark option ' + (optionIndex + 1) + ' correct'} />
                  <input className="input" value={option.label} maxLength={2000} required
                    placeholder={'Option ' + (optionIndex + 1)}
                    onChange={(e) => changeOption(q.id, option.id, { label: e.target.value })} />
                  <button type="button" className="btn btn-secondary" disabled={busy || q.options.length <= 2}
                    onClick={() => removeOption(q.id, option.id)} aria-label={'Remove option ' + (optionIndex + 1)}>×</button>
                </div>
              ))}
              <button type="button" className="btn btn-secondary" disabled={busy || q.options.length >= 20}
                onClick={() => changeQuestion(q.id, { options: [...q.options, newOption(false)] })}>Add option</button>
            </div>
          )}
          <div className="field">
            <label htmlFor={'guide-' + q.id}>Evaluator guidance (admin-only, optional)</label>
            <textarea id={'guide-' + q.id} className="textarea" rows={4} maxLength={30000}
              value={q.guidance} onChange={(e) => changeQuestion(q.id, { guidance: e.target.value })}
              placeholder="Explanation, sample answer, or marking notes (not shown to students)" />
          </div>
        </section>
      ))}

      <div className="actions">
        <button type="button" className="btn btn-secondary" disabled={busy || questions.length >= 200}
          onClick={() => { setSaved(false); setQuestions((old) => [...old, newQuestion()]) }}>
          Add multiple-choice question
        </button>
        <button type="button" className="btn btn-secondary" disabled={busy || questions.length >= 200}
          onClick={() => { setSaved(false); setQuestions((old) => [...old, newQuestion('short_text')]) }}>
          Add written question
        </button>
      </div>

      {error && <div className="alert" role="alert">{error}</div>}
      {saved && <div className="success" role="status">Exam and questions saved. Students will see the updated paper when they start.</div>}
      <div className="actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save exam and questions'}
        </button>
      </div>
    </form>
  )
}
