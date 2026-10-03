export type Question = {
  id: string
  prompt: string
  type: 'single_choice' | 'short_text'
  points: number
  position: number
  question_options?: { id: string; label: string; position: number }[]
}

export type AttemptStatus = 'in_progress' | 'submitted' | 'disqualified' | 'graded'
