import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import * as jose from 'jose';
import { prisma } from '@/lib/prisma';
import { isHrUser } from '@/lib/leaveApprovalConfig';
import { getAllLeaveRequestsArchive } from '@/lib/leaveDb';
import AllLeavesFilters from './AllLeavesFilters';
import './all-leaves.css';

// Formats a date as dd/mm/yyyy regardless of server/browser locale
function formatDate(dateValue) {
  if (!dateValue) return '-';
  const d = new Date(dateValue);
  if (isNaN(d.getTime())) return '-';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

export default async function AllLeavesPage({ searchParams }) {
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

  if (!isHrUser(currentUserId)) {
    redirect('/dashboard');
  }

  let leaves = [];
  try {
    leaves = await getAllLeaveRequestsArchive();
  } catch (error) {
    console.error('Failed to load all leave requests:', error);
    leaves = [];
  }

  // Next.js 15: searchParams is async
  const params = await searchParams;
  const selectedYear = params?.year || '';
  const selectedMonth = params?.month || '';

  // Apply year/month filters based on StartDate
  const filteredLeaves = leaves.filter((leave) => {
    if (!leave.StartDate) return false;
    const d = new Date(leave.StartDate);
    if (isNaN(d.getTime())) return false;

    if (selectedYear && String(d.getFullYear()) !== String(selectedYear)) {
      return false;
    }
    if (selectedMonth && String(d.getMonth() + 1) !== String(selectedMonth)) {
      return false;
    }
    return true;
  });

  return (
    <div className="allLeavesContainer">
      <h1 className="allLeavesTitle">All Leave Requests</h1>

      <AllLeavesFilters />

      {filteredLeaves.length === 0 ? (
        <p className="allLeavesEmpty">No leave requests found.</p>
      ) : (
        <div className="allLeavesTableWrapper">
          <table className="allLeavesTable">
            <thead>
              <tr>
                <th>#</th>
                <th>Applicant ID</th>
                <th>Applicant Name</th>
                <th>Department</th>
                <th>Section</th>
                <th>Start Date</th>
                <th>End Date</th>
                <th>From Time</th>
                <th>To Time</th>
                <th>HOD Status</th>
                <th>CCC Status</th>
                <th>Leave Type</th>
              </tr>
            </thead>
            <tbody>
              {filteredLeaves.map((leave, index) => (
                <tr key={`${leave.ApplicantId}-${leave.StartDate}-${leave.EndDate}-${index}`}>
                  <td>{index + 1}</td>
                  <td>{leave.ApplicantId || '-'}</td>
                  <td>{leave.ApplicantName || '-'}</td>
                  <td>{leave.Department || '-'}</td>
                  <td>{leave.Section || '-'}</td>
                  <td>{formatDate(leave.StartDate)}</td>
                  <td>{formatDate(leave.EndDate)}</td>
                  <td>{leave.FromTime || '-'}</td>
                  <td>{leave.ToTime || '-'}</td>
                  <td>{leave.HodStatus || '-'}</td>
                  <td>{leave.CccStatus || '-'}</td>
                  <td>{leave.LeaveType || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}