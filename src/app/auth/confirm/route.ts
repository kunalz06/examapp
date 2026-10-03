import { type EmailOtpType } from '@supabase/supabase-js'
import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const redirectTo = request.nextUrl.clone()
  redirectTo.pathname = '/login'
  redirectTo.search = ''

  if (tokenHash && type) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })

    if (!error) {
      redirectTo.searchParams.set('verified', '1')
      return NextResponse.redirect(redirectTo)
    }
  }

  redirectTo.searchParams.set('error', 'confirmation_failed')
  return NextResponse.redirect(redirectTo)
}
