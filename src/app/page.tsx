import Link from 'next/link'

export default function HomePage() {
  return (
    <main>
      <section className="container hero">
        <div className="hero-copy">
          <div className="eyebrow">Examination portal</div>
          <h1>Secure access to your scheduled examinations.</h1>
          <p className="lead">Sign in with the credentials issued by your examination administrator.</p>
          <div className="actions hero-actions">
            <Link className="btn btn-primary btn-lg" href="/login">Student sign in</Link>
            <Link className="btn btn-secondary btn-lg" href="/privacy">Privacy policy</Link>
          </div>
        </div>

        <aside className="portal-card" aria-label="Exam requirements">
          <div className="portal-card-head"><span className="status-dot" aria-hidden /><span>Before an exam</span></div>
          <div className="requirement-list">
            <div><b>Issued credentials</b><span>Use the account created by your examination administrator.</span></div>
            <div><b>Camera and microphone</b><span>Both must remain available during the attempt.</span></div>
            <div><b>Focused browser session</b><span>Leaving the exam tab is recorded as a violation.</span></div>
            <div><b>Stable connection</b><span>Answers are saved throughout the exam.</span></div>
          </div>
        </aside>
      </section>

      <section className="container portal-summary" aria-label="Portal features">
        <article><span className="summary-index">01</span><h3>Assigned exams</h3><p>View available examinations and their time limits from one dashboard.</p></article>
        <article><span className="summary-index">02</span><h3>Controlled attempts</h3><p>Camera, microphone, timing, autosave, and tab-violation checks run during the session.</p></article>
        <article><span className="summary-index">03</span><h3>Clear outcomes</h3><p>See submission status and results after an attempt has been completed or graded.</p></article>
      </section>
    </main>
  )
}
