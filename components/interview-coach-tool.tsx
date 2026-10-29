'use client'

import { useState } from 'react'
import { CopyTextButton, StatusNote, SubmitRow, TextField, useToolkitRequest } from '@/components/toolkit-ui'
import type { InterviewQuestion } from '@/lib/toolkit-parse'

type Feedback = {
  feedback: string
  strengths: string[]
  improvements: string[]
  revisedOutline: string
}

type Reply = {
  feedback: string
  nextQuestion: string
  structureHint: string
}

type Turn = { role: 'coach' | 'candidate'; content: string }

export function InterviewCoachTool() {
  const [job, setJob] = useState('')
  const [resume, setResume] = useState('')
  const [answer, setAnswer] = useState('')
  const [activeQuestion, setActiveQuestion] = useState('')
  const [questions, setQuestions] = useState<InterviewQuestion[]>([])
  const [history, setHistory] = useState<Turn[]>([])
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const start = useToolkitRequest<{ questions: InterviewQuestion[] }>()
  const review = useToolkitRequest<Feedback>()
  const next = useToolkitRequest<Reply>()

  const busy = start.loading || review.loading || next.loading
  const error = start.error || review.error || next.error

  return (
    <div className="flex flex-col gap-6">
      <form
        className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5"
        onSubmit={(event) => {
          event.preventDefault()
          void start.submit('/api/interview', { mode: 'start', job, resume }).then((payload) => {
            if (!payload) return
            setQuestions(payload.questions)
            setActiveQuestion(payload.questions[0]?.prompt || '')
            setHistory(payload.questions[0] ? [{ role: 'coach', content: payload.questions[0].prompt }] : [])
            setFeedback(null)
          })
        }}
      >
        <TextField id="interview-job" label="Job description" value={job} onChange={setJob} placeholder="Paste the role you are interviewing for" rows={8} />
        <TextField id="interview-resume" label="Resume (optional)" value={resume} onChange={setResume} placeholder="Paste a resume if you want examples grounded in your experience" rows={6} />
        <SubmitRow loading={start.loading} label="Generate questions" />
      </form>

      {questions.length > 0 ? (
        <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold">Questions</h2>
          <ul className="flex flex-col gap-4">
            {questions.map((item, index) => (
              <li key={`${item.prompt}-${index}`} className="rounded-xl bg-secondary px-3 py-3">
                <button type="button" className="text-left text-[14px] font-medium" onClick={() => setActiveQuestion(item.prompt)}>
                  {item.prompt}
                </button>
                <p className="mt-1 text-[12px] uppercase tracking-wide text-muted-foreground">{item.category}</p>
                <p className="mt-2 text-[13px] text-muted-foreground">{item.structure}</p>
                <p className="mt-2 text-[13px] leading-relaxed">{item.sampleAnswer}</p>
                <div className="mt-2">
                  <CopyTextButton text={`${item.prompt}\n\n${item.sampleAnswer}`} label="Copy sample" />
                </div>
              </li>
            ))}
          </ul>

          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault()
              const question = activeQuestion || questions[0]?.prompt || ''
              void review.submit('/api/interview', { mode: 'feedback', job, question, answer }).then((payload) => {
                if (payload) setFeedback(payload)
              })
            }}
          >
            <TextField id="interview-answer" label={`Your answer${activeQuestion ? ` — ${activeQuestion}` : ''}`} value={answer} onChange={setAnswer} placeholder="Write your answer to the selected question" rows={6} />
            <div className="flex flex-wrap gap-2">
              <SubmitRow loading={review.loading} label="Get feedback" disabled={busy && !review.loading} />
              <button
                type="button"
                disabled={busy || answer.trim().length < 10}
                onClick={() => {
                  void next.submit('/api/interview', { mode: 'reply', job, answer, history }).then((payload) => {
                    if (!payload) return
                    setHistory((current) => [
                      ...current,
                      { role: 'candidate', content: answer },
                      { role: 'coach', content: payload.nextQuestion },
                    ])
                    setActiveQuestion(payload.nextQuestion)
                    setQuestions((current) => [
                      ...current,
                      {
                        prompt: payload.nextQuestion,
                        category: 'role',
                        structure: payload.structureHint,
                        sampleAnswer: '',
                      },
                    ])
                    setFeedback({
                      feedback: payload.feedback,
                      strengths: [],
                      improvements: [],
                      revisedOutline: payload.structureHint,
                    })
                    setAnswer('')
                  })
                }}
                className="inline-flex items-center rounded-full border border-border px-5 py-2.5 text-[13px] font-semibold disabled:opacity-50"
              >
                {next.loading ? 'Working…' : 'Continue interview'}
              </button>
            </div>
          </form>
          {feedback ? (
            <div className="rounded-xl border border-border px-3 py-3 text-[13px] leading-relaxed">
              <p>{feedback.feedback}</p>
              {feedback.strengths.length > 0 ? <p className="mt-2 text-muted-foreground">Strengths: {feedback.strengths.join(' ')}</p> : null}
              {feedback.improvements.length > 0 ? <p className="mt-2 text-muted-foreground">Improve: {feedback.improvements.join(' ')}</p> : null}
              <p className="mt-2">{feedback.revisedOutline}</p>
            </div>
          ) : null}
        </section>
      ) : null}
      <StatusNote error={error} />
    </div>
  )
}
