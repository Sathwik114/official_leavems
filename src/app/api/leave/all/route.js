import { NextResponse } from 'next/server';
import { getAllLeaveRequests, getAllLeaveApprovals } from '@/lib/leaveDb';

export async function GET() {
  try {
    const requests = await getAllLeaveRequests();
    const approvals = await getAllLeaveApprovals();

    return NextResponse.json({ requests, approvals });
  } catch (err) {
    console.error('Failed to fetch all leave data:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
