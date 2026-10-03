import type { Metadata } from 'next'
import Link from 'next/link'
import './globals.css'
import { Header } from '@/components/Header'

export const metadata: Metadata = {
  title: { default: 'ExamCore', template: '%s | ExamCore' },
  description: 'Secure web-based examinations with role-based administration and browser proctoring signals.',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Header />
        {children}
        <footer className="footer">
          <div className="container actions">
            <span>© 2026 ExamCore</span>
            <Link href="/privacy">Privacy Policy</Link>
            <Link href="/terms">Terms</Link>
          </div>
        </footer>
      </body>
    </html>
  )
}
