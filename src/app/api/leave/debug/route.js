import { NextResponse } from 'next/server';
import { getPendingApprovalsForUser, getApprovedRequestsForApprover } from '@/lib/leaveDb';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const approver = searchParams.get('approver');

    if (!approver) {
      return NextResponse.json({ error: 'approver query param is required' }, { status: 400 });
    }

    const pending = await getPendingApprovalsForUser(approver);
    const approved = await getApprovedRequestsForApprover(approver);

    return NextResponse.json({ pendingApprovals: pending, approvedRequests: approved });
  } catch (err) {
    console.error('Debug leave fetch error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
