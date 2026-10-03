import Link from 'next/link'

export default function HomePage() {
  return (
    <main>
      <section className="container hero">
        <div>
          <div className="eyebrow">Web examination platform</div>
          <h1>Exams that are simple to run and clear to audit.</h1>
          <p className="lead">
            Students take timed exams in a focused interface. Administrators publish exams, view candidates,
            review attempts, and grade written responses from one dashboard.
          </p>
          <div className="actions" style={{ marginTop: 26 }}>
            <Link className="btn btn-primary" href="/login">Get started</Link>
            <Link className="btn btn-secondary" href="/privacy">Read privacy policy</Link>
          </div>
        </div>
        <aside className="hero-card">
          <span className="badge black">Exam controls</span>
          <h2 style={{ marginTop: 18 }}>Three-strike tab policy</h2>
          <p className="muted">
            During an active exam, camera and microphone access are required. Leaving the exam tab is logged.
            The third confirmed tab-hide event disqualifies the attempt server-side.
          </p>
          <div className="divider" />
          <div className="grid grid-2">
            <div className="stat"><b>3</b><span className="muted small">tab violations</span></div>
            <div className="stat"><b>2</b><span className="muted small">roles: student/admin</span></div>
          </div>
        </aside>
      </section>
      <section className="container section">
        <div className="grid grid-3">
          <div className="card"><h3>Focused exam UX</h3><p className="muted">Timed questions, autosave, visible proctoring status, and a clear submit flow.</p></div>
          <div className="card"><h3>Admin grading</h3><p className="muted">Automatic MCQ scoring plus manual marking and feedback for written answers.</p></div>
          <div className="card"><h3>Privacy by design</h3><p className="muted">The starter requires camera/mic presence but does not record or upload media streams.</p></div>
        </div>
      </section>
    </main>
  )
}
