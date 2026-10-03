import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Terms' }

export default function TermsPage() {
  return (
    <main><article className="container legal">
      <div className="eyebrow">Exam rules</div><h1 style={{ fontSize: 48, marginTop: 8 }}>Terms of Use</h1>
      <p>Last updated: October 3, 2026. These starter terms must be adapted by the organization running the examinations.</p>
      <h2>Eligibility and account use</h2>
      <p>You must use your own authorized account and provide accurate information. You are responsible for keeping account credentials confidential.</p>
      <h2>Proctored exam requirements</h2>
      <p>For exams marked as proctored by this application, you must grant camera and microphone access and keep both available during the active attempt. You should use a supported browser, stable internet connection, and a device with working camera and microphone.</p>
      <h2>Tab-switch rule</h2>
      <p>You must keep the exam page active. Each server-confirmed event in which the exam page becomes hidden counts as a tab-switch violation. At three violations, the system automatically disqualifies the attempt. Closing the browser, changing applications, using browser tools, or disabling scripts may also violate rules set by the exam organizer even when this application cannot technically detect every action.</p>
      <h2>Exam integrity</h2>
      <p>You may not impersonate another candidate, obtain unauthorized assistance, share exam content, tamper with the application, manipulate network requests, bypass proctoring controls, or access answer keys or administrative functions without authorization.</p>
      <h2>Scoring and grading</h2>
      <p>Eligible single-choice questions may be scored automatically. Written responses may be marked by authorized administrators. A result can remain provisional until manual marking is complete.</p>
      <h2>Technical interruptions</h2>
      <p>If a genuine technical problem affects an exam, notify the organizer using its published support process. The organizer should define its own policy for resets, retakes, appeals, and accommodations.</p>
      <h2>Privacy</h2>
      <p>Use of the service is also governed by the Privacy Policy, including its explanation of camera, microphone, exam responses, and browser-visibility events.</p>
      <h2>Operator details</h2>
      <p>Before production launch, the exam operator must add its legal name, contact information, governing law, dispute process, eligibility rules, and any institution-specific examination regulations.</p>
    </article></main>
  )
}
