import { NextRequest, NextResponse } from 'next/server'

const COOKIE_NAME = 'abtow_admin_session'

export async function GET(req: NextRequest) {
  const cookie = req.cookies.get(COOKIE_NAME)?.value
  const adminPassword = process.env.ADMIN_PASSWORD

  if (!adminPassword || !cookie || cookie !== adminPassword) {
    return NextResponse.json({ admin: false })
  }

  return NextResponse.json({ admin: true })
}
