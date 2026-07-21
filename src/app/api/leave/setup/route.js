import { NextResponse } from 'next/server';
import { ensureLeaveTables } from '@/lib/leaveDb';

export async function GET() {
  try {
    await ensureLeaveTables();
    return NextResponse.json({ success: true, message: 'Leave tables ensured' });
  } catch (err) {
    console.error('Setup leave tables error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST() {
  return GET();
}
