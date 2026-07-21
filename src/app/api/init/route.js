import { NextResponse } from 'next/server';
import { ensureLeaveTables } from '@/lib/leaveDb';

export async function GET() {
  try {
    await ensureLeaveTables();
    return NextResponse.json({
      success: true,
      message: 'Database tables initialized successfully.',
    });
  } catch (error) {
    console.error('Initialization error:', error);
    return NextResponse.json(
      { error: 'Failed to initialize database tables.', details: error.message },
      { status: 500 }
    );
  }
}
