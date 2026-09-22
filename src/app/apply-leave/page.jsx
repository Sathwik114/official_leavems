import { cookies } from 'next/headers';
import * as jose from 'jose';
import { getEmployeeDetails } from '@/lib/payrollDb';
import { getLeaveApprovalFlow } from '@/lib/leaveApprovalConfig';
import { ensureLeaveTables } from '@/lib/leaveDb';
import ApplyLeaveForm from './ApplyLeaveForm';

export default async function ApplyLeavePage({ searchParams }) {
  // Initialize leave database tables on page load
  try {
    await ensureLeaveTables();
  } catch (err) {
    // Silently fail if table initialization errors
  }

  const params = await searchParams;
  const empcode = params?.empcode || '';

  let employee = null;
  let currentUserUsername = '';
  let approvalFlow = null;

  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;

  if (token) {
    try {
      const secret = new TextEncoder().encode(process.env.JWT_SECRET);
      const { payload } = await jose.jwtVerify(token, secret);
      currentUserUsername = String(payload.username || payload.name || '');
    } catch (err) {
      console.error('JWT Error:', err);
    }
  }

  const applicantId = empcode || currentUserUsername;

  if (applicantId) {
    try {
      employee = await getEmployeeDetails(applicantId);
      approvalFlow = await getLeaveApprovalFlow(employee?.EmpCode || applicantId);
    } catch (err) {
      console.error('Employee fetch error:', err);
    }
  }

  return (
    <ApplyLeaveForm
      employee={employee}
      currentUserUsername={currentUserUsername}
      approvalFlow={approvalFlow}
    />
  );
}
