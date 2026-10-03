import type { Metadata } from 'next'
import Link from 'next/link'
import './globals.css'
import { Header } from '@/components/Header'
import { SiteChrome } from '@/components/SiteChrome'

export const metadata: Metadata = {
  title: { default: 'ExamCore', template: '%s | ExamCore' },
  description: 'Secure web-based examination portal.',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const footer = (
    <footer className="footer">
      <div className="container footer-inner">
        <span>© 2026 ExamCore</span>
        <div className="footer-links">
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/terms">Terms</Link>
        </div>
      </div>
    </footer>
  )

  return (
    <html lang="en">
      <body>
        <SiteChrome header={<Header />} footer={footer}>
          {children}
        </SiteChrome>
      </body>
    </html>
  )
}
