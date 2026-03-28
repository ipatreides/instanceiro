import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    latest_version: process.env.CLAUDINHO_VERSION ?? '1.0.0',
    download_url: process.env.CLAUDINHO_DOWNLOAD_URL ?? '',
    changelog: process.env.CLAUDINHO_CHANGELOG ?? '',
    required: false,
  })
}
