import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import * as jose from 'jose';
import {
  canAccessMyAttendance,
  getDashboardRedirectForUser,
} from '@/lib/leaveApprovalConfig';
import MyAttendancePage from '../MyAttendancePage';

export default async function MyAttendanceRoutePage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;
  let currentUserId = '';

  if (token) {
    try {
      const secret = new TextEncoder().encode(process.env.JWT_SECRET);
      const { payload } = await jose.jwtVerify(token, secret);
      currentUserId = String(payload.username || payload.name || '').trim();
    } catch (err) {
      console.error('JWT Error:', err);
    }
  }

  if (!canAccessMyAttendance(currentUserId)) {
    redirect(getDashboardRedirectForUser(currentUserId));
  }

  return <MyAttendancePage empcode={currentUserId} />;
}
