'use client'

import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'

export function SiteChrome({
  header,
  footer,
  children,
}: {
  header: ReactNode
  footer: ReactNode
  children: ReactNode
}) {
  const pathname = usePathname()
  const isAdmin = pathname.startsWith('/admin')

  return (
    <>
      {!isAdmin && header}
      {children}
      {!isAdmin && footer}
    </>
  )
}
