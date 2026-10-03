import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json({ error: 'Email confirmation is disabled for student accounts.' }, { status: 410 })
}
