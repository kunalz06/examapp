import { type NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const redirectTo = request.nextUrl.clone()
  redirectTo.pathname = '/login'
  redirectTo.search = ''
  return NextResponse.redirect(redirectTo)
}
