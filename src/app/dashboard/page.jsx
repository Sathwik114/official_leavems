import './page.css';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import * as jose from 'jose';
import { getAttendance } from '@/lib/attendanceDb';
import { ensureLeaveTables } from '@/lib/leaveDb';
import { getEmployeeDetails } from '@/lib/payrollDb';
import { isCccUser, isHrUser } from '@/lib/leaveApprovalConfig';
import AttendanceTable from './AttendanceTable';

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

  // HR users don't use this dashboard — send them straight to Pending Leaves
  if (isHrUser(user.username)) {
    redirect('/dashboard/pending-leaves');
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

      </div>

      <div className="dashboardAttendance">
        <h2>My Attendance</h2>

        {attendance.length === 0 ? (
          <p>No attendance records found.</p>
        ) : (
          <AttendanceTable attendance={attendanceWithEmployeeNames} canApplyLeave={!isCccUser(user.username)} />
        )}
      </div>

    </div>
  );
}