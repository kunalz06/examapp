import type { NextConfig } from 'next'

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(), payment=()' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'" },
]

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Redirect legacy production hostnames to the canonical BTF ExamCore domain.
  // Keep the path and query string intact, including existing account links.
  async redirects() {
    return [
      'examapp-seven.vercel.app',
      'examapp-mitraricky06-gmailcoms-projects.vercel.app',
      'examapp-git-main-mitraricky06-gmailcoms-projects.vercel.app',
    ].map((host) => ({
      source: '/:path*',
      has: [{ type: 'host' as const, value: host }],
      destination: 'https://btfexamcore.vercel.app/:path*',
      permanent: true,
    }))
  },
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }]
  },
}

export default nextConfig
