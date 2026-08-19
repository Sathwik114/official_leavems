import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import * as jose from 'jose';
import { prisma } from '@/lib/prisma';
import { isHrUser } from '@/lib/leaveApprovalConfig';
import PendingLeavesControls from './PendingLeavesControls';
import './pending-leaves.css';

export default async function PendingLeavesPage({ searchParams }) {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;
  let currentUserId = '';

  if (token) {
    try {
      const secret = new TextEncoder().encode(process.env.JWT_SECRET);
      const { payload } = await jose.jwtVerify(token, secret);

      currentUserId = String(
        payload.username || payload.name || ''
      ).trim();
    } catch (err) {
      console.error('JWT Error:', err);
    }
  }

  // HR only
  if (!isHrUser(currentUserId)) {
    redirect('/dashboard');
  }

  // RAW SQL QUERY
  // Shows only records where CccStatus is NULL or empty
  // Hides records where CccStatus = 'Accept'
  const rawLeaves = await prisma.$queryRaw`
  SELECT
    Id,
    ApplicantId,
    ApplicantName,
    LeaveType,
    StartDate,
    EndDate,
    CAST(TotalDays AS FLOAT) AS TotalDays,
    Reason,
    HodStatus,
    CccStatus
    FROM dbo.LeaveRequests
    WHERE (CccStatus IS NULL OR LTRIM(RTRIM(CccStatus)) = '')
      AND (HodStatus IS NULL OR UPPER(LTRIM(RTRIM(HodStatus))) <> 'REJECTED')
      AND (CccStatus IS NULL OR UPPER(LTRIM(RTRIM(CccStatus))) <> 'REJECTED')
  `;

  function formatDateDDMMYYYY(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  // Sort by StartDate descending
  const sortedLeaves = [...rawLeaves].sort(
    (a, b) => new Date(b.StartDate) - new Date(a.StartDate)
  );

  // --- Month/Year filter ---
  // Next.js 15: searchParams is async
  // --- Year/Month/Pending-status filter ---
  // Next.js 15: searchParams is async
  const params = await searchParams;
  const now = new Date();
  const selectedYear = params?.year ? parseInt(params.year, 10) : now.getFullYear();

  // 'month' distinguishes three states:
  //  - param absent            -> default to current month
  //  - param === 'all'         -> show all months (no filter)
  //  - param is a number 1-12  -> filter to that month
  const monthParam = params?.month;
  const selectedMonth =
    monthParam === undefined ? now.getMonth() + 1
    : monthParam === 'all' ? null
    : parseInt(monthParam, 10);

  const selectedStatus = params?.status || ''; // '' = all, 'VP' = HodStatus pending, 'PRESIDENT' = CccStatus pending

  const pendingLeaves = sortedLeaves.filter((leave) => {
    if (!leave.StartDate) return false;
    const d = new Date(leave.StartDate);
    if (Number.isNaN(d.getTime())) return false;

    if (selectedYear && d.getFullYear() !== selectedYear) return false;
    if (selectedMonth && (d.getMonth() + 1) !== selectedMonth) return false;

    const vpPending = !leave.HodStatus || !leave.HodStatus.trim();
    const presidentPending = !leave.CccStatus || !leave.CccStatus.trim();

    if (selectedStatus === 'VP' && !vpPending) return false;
    if (selectedStatus === 'PRESIDENT' && !presidentPending) return false;

    return true;
  });

  return (
    <div className="pendingLeavesContainer">
      <h1 className="pendingLeavesTitle">
        Pending Leaves
      </h1> 

      <PendingLeavesControls leaves={pendingLeaves} />

      {pendingLeaves.length === 0 ? (
        <p className="pendingLeavesEmpty">
          No pending leave requests.
        </p>
      ) : (
        <div className="pendingLeavesTableWrapper">
          <table className="pendingLeavesTable">
            <thead>
              <tr>
                <th>Employee ID</th>
                <th>Employee Name</th>
                <th>Leave Type</th>
                <th>Start Date</th>
                <th>End Date</th>
                <th>Total Days</th>
                <th>Reason</th>
                <th>Vice President Status</th>
                <th>President Status</th>
              </tr>
            </thead>

            <tbody>
              {pendingLeaves.map((leave) => (
                <tr key={leave.Id}>
                  <td>{leave.ApplicantId}</td>
                  <td>{leave.ApplicantName}</td>
                  <td>{leave.LeaveType}</td>

                  <td>{formatDateDDMMYYYY(leave.StartDate)}</td>
                  <td>{formatDateDDMMYYYY(leave.EndDate)}</td>

                  <td>{leave.TotalDays}</td>
                  <td>{leave.Reason}</td>

                  <td>{leave.HodStatus ?? 'Pending'}</td>

                  <td>
                    {leave.CccStatus?.trim() || 'Pending'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}