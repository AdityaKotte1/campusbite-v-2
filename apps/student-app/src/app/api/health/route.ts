import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    service: 'munchadda-student-app',
    version: '0.1.0',
  });
}
