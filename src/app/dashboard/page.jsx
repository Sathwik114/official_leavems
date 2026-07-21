import './page.css';
import { cookies } from 'next/headers';
import * as jose from 'jose';
import Link from 'next/link';
import { getAttendance } from '@/lib/attendanceDb';
import { ensureLeaveTables } from '@/lib/leaveDb';
import { getEmployeeDetails } from '@/lib/payrollDb';
import { isCccOrHrUser } from '@/lib/leaveApprovalConfig';

export default async function Dashboard() {
  // Initialize leave database tables on dashboard load
  try {
    await ensureLeaveTables();
  } catch (err) {
    // Silently fail if table initialization errors
  }

  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;

  let user = {
    name: 'Member',
    email: 'Not available',
    username: 'Member',
  };

  let attendance = [];
  let attendanceWithEmployeeNames = [];
  let currentEmployee = null;

  // Decode JWT
  if (token) {
    try {
      const secret = new TextEncoder().encode(process.env.JWT_SECRET);
      const { payload } = await jose.jwtVerify(token, secret);

      user = {
        ...payload,
        name: payload.name || payload.username || 'Member',
        username: payload.username || payload.name || 'Member',
        email: payload.email || 'Not available',
      };
    } catch (err) {
      console.error('JWT Error:', err);
    }
  }

  // Fetch attendance
  if (user.username && user.username !== 'Member') {
    try {
      attendance = await getAttendance(Number(user.username));
      currentEmployee = await getEmployeeDetails(String(user.username));
      attendanceWithEmployeeNames = await Promise.all(
        attendance.map(async (row) => {
          const employee = row.Empcode ? await getEmployeeDetails(String(row.Empcode)) : null;
          return {
            ...row,
            EmployeeCode: row.Empcode || '-',
            EmployeeName: employee?.EmpName || row.Empcode || '-',
            Department: employee?.DeptCode || '-',
          };
        })
      );
    } catch (err) {
      console.error('Attendance Error:', err);
    }
  }

  return (
    <div className="dashboardPage">
      <div className="dashboardBlob dashboardBlobOne" />
      <div className="dashboardBlob dashboardBlobTwo" />

      <div className="dashboardAvatar">
        
      </div>

      <div className="dashboardHeader">
        <h1 className="dashboardHeaderTitle">
          Hello, {currentEmployee?.EmpName || user.name || user.username}
        </h1>

        <p className="dashboardHeaderText">
          You have successfully authenticated and entered the secure workspace.
        </p>
      </div>

      <div className="dashboardAttendance">
        <h2>My Attendance</h2>

        {attendance.length === 0 ? (
          <p>No attendance records found.</p>
        ) : (
          <div className="dashboardAttendanceTableWrap">
            <table className="attendanceTable">
              <thead>
                <tr>
                  <th>Employee ID</th>
                  <th>Employee Name</th>
                  <th>Department</th>
                  <th>Date</th>
                  <th>Attendance</th>
                  <th>In Time</th>
                  <th>Out Time</th>
                  <th>Apply For a Leave</th>
                </tr>
              </thead>

              <tbody>
                {attendanceWithEmployeeNames.map((row, index) => (
                  <tr key={`${row.Empcode || 'emp'}-${row.AttDate ? new Date(row.AttDate).toISOString() : index}`}>
                    <td>{row.EmployeeCode}</td>
                    <td>{row.EmployeeName}</td>
                    <td>{row.Department}</td>

                    <td>
                      {row.AttDate
                        ? new Date(row.AttDate).toLocaleDateString()
                        : '-'}
                    </td>

                    <td>{row.AttType || '-'}</td>

                    <td>
                      {row.InTime instanceof Date
                        ? row.InTime.toLocaleTimeString("en-GB", { hour12: false })
                        : row.InTime || "-"}
                    </td>

                    <td>
                      {row.OutTime instanceof Date
                        ? row.OutTime.toLocaleTimeString("en-GB", { hour12: false })
                        : row.OutTime || "-"}
                    </td>
                    <td>
                      {!isCccOrHrUser(user.username) ? (
                        <Link href={`/apply-leave?empcode=${row.Empcode}`}>
                          <button type="button" className="applyLeaveButton">Apply Now</button>
                        </Link>
                      ) : (
                        <button type="button" className="applyLeaveButton" disabled>
                          Not Eligible
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}