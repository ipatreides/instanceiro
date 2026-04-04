import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    { error: 'This endpoint is deprecated. Use mvp-event instead.' },
    { status: 410 }
  )
}
