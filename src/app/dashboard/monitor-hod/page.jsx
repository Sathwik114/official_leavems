import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import * as jose from 'jose';
import { canAccessMonitorHod, getMonitorHodListEntries } from '@/lib/leaveApprovalConfig';
import MonitorHodPage from '../MonitorHodPage';

export default async function MonitorHodRoutePage() {
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

  if (!(await canAccessMonitorHod(currentUserId))) {
    redirect('/dashboard');
  }

  const hodList = await getMonitorHodListEntries(currentUserId);

  return <MonitorHodPage hodList={hodList} />;
}
