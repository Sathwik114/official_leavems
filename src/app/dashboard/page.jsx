import './page.css';
import { cookies } from 'next/headers';
import * as jose from 'jose';
import Link from 'next/link';
import LogoutButton from './LogoutButton';
import { getAttendance } from '@/lib/attendanceDb';


export default async function Dashboard() {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;

  let user = {
    name: 'Member',
    email: 'Not available',
    username: 'Member',
  };

  let attendance = [];

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
    } catch (err) {
      console.error('Attendance Error:', err);
    }
  }

  return (
    <div className="dashboardPage">
      <div className="dashboardBlob dashboardBlobOne" />
      <div className="dashboardBlob dashboardBlobTwo" />

      <div className="dashboardTopBar">
        <LogoutButton />
      </div>

      <div className="dashboardAvatar">
        
      </div>

      <div className="dashboardHeader">
        <h1 className="dashboardHeaderTitle">
          Hello, {user.username}
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
          <table className="attendanceTable">
            <thead>
              <tr>
                <th>Emp Code</th>
                <th>Designation</th>
                <th>Date</th>
                <th>Attendance</th>
                <th>In Time</th>
                <th>Out Time</th>
                <th>Apply For a Leave</th>
              </tr>
            </thead>

            <tbody>
              {attendance.map((row, index) => (
                <tr key={index}>
                  <td>{row.Empcode}</td>
                  <td>{row.DesigCode}</td>

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
                  <td> <Link href={`/apply-leave?empcode=${row.Empcode}`}> <button type="button" className="applyLeaveButton"> Apply Now </button> </Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}