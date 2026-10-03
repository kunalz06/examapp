import { redirect } from 'next/navigation'

export default function LegacyRecoveryPage() {
  redirect('/login?error=recovery_invalid')
}
