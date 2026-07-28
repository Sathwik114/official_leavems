import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import * as jose from 'jose';
import { prisma } from '@/lib/prisma';
import { isHrUser } from '@/lib/leaveApprovalConfig';
import './pending-leaves.css';

export default async function PendingLeavesPage() {
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

  // Sort by StartDate descending
  const pendingLeaves = [...rawLeaves].sort(
    (a, b) => new Date(b.StartDate) - new Date(a.StartDate)
  );

  return (
    <div className="pendingLeavesContainer">
      <h1 className="pendingLeavesTitle">
        Pending Leaves
      </h1>

      {pendingLeaves.length === 0 ? (
        <p className="pendingLeavesEmpty">
          No pending leave requests.
        </p>
      ) : (
        <div className="pendingLeavesTableWrapper">
          <table className="pendingLeavesTable">
            <thead>
              <tr>
                <th>Applicant ID</th>
                <th>Applicant Name</th>
                <th>Leave Type</th>
                <th>Start Date</th>
                <th>End Date</th>
                <th>Total Days</th>
                <th>Reason</th>
                <th>HOD Status</th>
                <th>CCC Status</th>
              </tr>
            </thead>

            <tbody>
              {pendingLeaves.map((leave) => (
                <tr key={leave.Id}>
                  <td>{leave.ApplicantId}</td>
                  <td>{leave.ApplicantName}</td>
                  <td>{leave.LeaveType}</td>

                  <td>
                    {leave.StartDate
                      ? new Date(leave.StartDate).toLocaleDateString()
                      : '-'}
                  </td>

                  <td>
                    {leave.EndDate
                      ? new Date(leave.EndDate).toLocaleDateString()
                      : '-'}
                  </td>

                  <td>{leave.TotalDays}</td>
                  <td>{leave.Reason}</td>

                  <td>{leave.HodStatus ?? '-'}</td>

                  <td>
                    {leave.CccStatus?.trim() || '-'}
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