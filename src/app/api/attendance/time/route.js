import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import * as jose from 'jose';
import { updateAttendanceTime } from '@/lib/attendanceDb';
import { isCccUser } from '@/lib/leaveApprovalConfig';

export async function POST(request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('auth_token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jose.jwtVerify(token, secret);
    const currentUsername = payload.username || payload.name;

    const { empcode, attendanceDate, timeField, timeValue } = await request.json();

    if (!empcode || !attendanceDate || !timeField || !timeValue) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (timeField !== 'in' && timeField !== 'out') {
      return NextResponse.json({ error: 'Invalid time field' }, { status: 400 });
    }

    // A user can only edit their own attendance, unless they're CCC.
    if (String(empcode) !== String(currentUsername) && !(await isCccUser(currentUsername))) {
      return NextResponse.json({ error: 'You are not allowed to update this record' }, { status: 403 });
    }

    await updateAttendanceTime(empcode, attendanceDate, timeField, timeValue);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Update attendance time error:', err);
    return NextResponse.json({ error: err.message || 'Failed to update attendance time' }, { status: 500 });
  }
}
