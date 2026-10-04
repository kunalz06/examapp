import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Privacy Policy' }

export default function PrivacyPage() {
  return (
    <main><article className="container legal">
      <div className="eyebrow">Privacy</div><h1 style={{ fontSize: 48, marginTop: 8 }}>Privacy Policy</h1>
      <p>Last updated: October 4, 2026. This starter policy must be reviewed and adapted by the organization operating the examination service before production use.</p>
      <h2>Information we process</h2>
      <p>We process account information, exam responses, scores, attempt timestamps, and exam-integrity events needed to deliver and administer examinations.</p>
      <h2>Camera, microphone, and automated face monitoring</h2>
      <p>During an active exam, the application requests access to your camera and microphone and checks that live media tracks remain available. Camera frames are analyzed in the browser to count visible faces for exam-integrity monitoring. The application does not perform face recognition, identify who a face belongs to, or upload or store camera or microphone recordings. Only proctoring event metadata and warning counts are sent to the exam service. The face-detection runtime is loaded from a third-party content delivery network and may process technical performance or utilization telemetry according to that provider&apos;s terms.</p>
      <h2>Browser activity signals</h2>
      <p>During an exam, the application uses browser visibility events to detect when the exam page becomes hidden. It stores the event time, attempt identifier, event type, and limited technical details. The application may also record when camera or microphone access is denied or ends.</p>
      <h2>Automated exam rules</h2>
      <p>The third server-confirmed hidden-tab event automatically disqualifies the attempt. Separately, if no face is detected continuously for more than 10 seconds, or more than one face is detected continuously for more than 10 seconds, a face-monitor warning is recorded. The fourth server-confirmed face-monitor warning automatically disqualifies the attempt. Administrators can see the attempt and related proctoring event log.</p>
      <h2>Purpose and access</h2>
      <p>Exam data is used to conduct exams, save answers, calculate eligible automatic scores, allow authorized administrators to grade written responses, investigate exam-integrity events, and provide results. Access is restricted by role and database row-level security.</p>
      <h2>Retention and deletion</h2>
      <p>The operating organization must publish a specific retention period appropriate to its legal and institutional requirements. Exam records should not be retained longer than necessary for examination, appeal, audit, or legal purposes.</p>
      <h2>Security</h2>
      <p>The application uses authenticated sessions, HTTPS when deployed, role-based authorization, database row-level security, and separation of answer keys from student-readable data. No internet service can guarantee absolute security.</p>
      <h2>Your choices</h2>
      <p>If you do not grant camera and microphone access, you cannot start or continue a proctored exam in this application. Contact the exam organizer before the exam if you need an accommodation or alternative examination arrangement.</p>
      <h2>Contact</h2>
      <p>The operating organization must add its legal identity, privacy contact, jurisdiction, and any rights or complaint procedures required by applicable law before launch.</p>
    </article></main>
  )
}
