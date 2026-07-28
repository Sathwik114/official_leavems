import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { hasDuplicateLeaveRequest } from '@/lib/leaveDb';

export async function GET(request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('auth_token')?.value;

    if (!token) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const applicantId = searchParams.get('applicantId');
    const startDate = searchParams.get('startDate');

    if (!applicantId || !startDate) {
      return NextResponse.json({ error: 'Missing applicantId or startDate' }, { status: 400 });
    }

    const exists = await hasDuplicateLeaveRequest(applicantId, startDate);
    return NextResponse.json({ exists });
  } catch (error) {
    console.error('Check duplicate error:', error);
    return NextResponse.json({ error: 'Failed to check duplicate leave requests' }, { status: 500 });
  }
}
