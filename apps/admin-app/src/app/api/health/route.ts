import { NextResponse } from 'next/server';

// Lightweight connectivity check polled by kiosks (api_client.is_online()).
// Public — no auth — just confirms the server is reachable and returns JSON.
export async function GET() {
  return NextResponse.json({
    success: true,
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
}
