'use client';

import { useEffect, useState } from 'react';
import { LEAVE_ROLE_RULES } from '@/lib/leaveApprovalConfig';
import './monitorhod.css';

async function fetchEmployeeProfile(empcode) {
  try {
    const res = await fetch(`/api/employee?empcode=${encodeURIComponent(empcode)}`);
    const data = await res.json();
    return res.ok ? data.employee : null;
  } catch (error) {
    console.error('Failed to fetch employee profile:', error);
    return null;
  }
}

// Computes "Xh Ym" duration between check-in and check-out.
// Handles both full datetime strings ("2026-07-20T09:15:00") and
// plain time strings ("09:15" / "09:15:00"). Handles overnight shifts.
function calculateWorkHours(inTime, outTime) {
  if (!inTime || !outTime) return null;

  const parseTime = (t) => {
    const str = String(t).trim();
    if (/\d{4}-\d{2}-\d{2}/.test(str)) {
      const d = new Date(str);
      return isNaN(d.getTime()) ? null : d;
    }
    const match = str.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (!match) return null;
    const [, h, m, s] = match;
    return new Date(1970, 0, 1, parseInt(h, 10), parseInt(m, 10), s ? parseInt(s, 10) : 0);
  };

  const inDate = parseTime(inTime);
  const outDate = parseTime(outTime);
  if (!inDate || !outDate) return null;

  let diffMs = outDate - inDate;
  if (diffMs < 0) diffMs += 24 * 60 * 60 * 1000; // overnight shift

  const totalMinutes = Math.round(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

// Sorts attendance records by AttDate, newest first.
function sortAttendanceDesc(records) {
  return [...records].sort((a, b) => new Date(b.AttDate) - new Date(a.AttDate));
}

const ALL_HOD_IDS = [
  ...LEAVE_ROLE_RULES.mf.ids.map((id) => ({ id, name: `${id} - MF` })),
  ...LEAVE_ROLE_RULES.adm.ids.map((id) => ({ id, name: `${id} - ADM` })),
  ...LEAVE_ROLE_RULES.vip.ids.map((id) => ({ id, name: `${id} - VIP` })),
];

export default function MonitorHodPage() {
  const [selectedEmpCode, setSelectedEmpCode] = useState('');
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [hodProfiles, setHodProfiles] = useState({});
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());

  async function loadAttendance(empcode) {
    if (!empcode) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/employee?empcode=${empcode}&month=${month}&year=${year}`);
      const data = await res.json();
      if (res.ok && data.attendance) {
        setAttendance(sortAttendanceDesc(data.attendance));
        setSelectedEmployee(data.employee || null);
      } else {
        setAttendance([]);
        setSelectedEmployee(null);
      }
    } catch (err) {
      console.error('Failed to load attendance:', err);
      setAttendance([]);
      setSelectedEmployee(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    async function loadProfiles() {
      const profiles = {};
      for (const hod of ALL_HOD_IDS) {
        const profile = await fetchEmployeeProfile(hod.id);
        profiles[hod.id] = profile;
      }
      setHodProfiles(profiles);
    }

    loadProfiles();
  }, []);

  useEffect(() => {
    if (selectedEmpCode) {
      loadAttendance(selectedEmpCode);
    }
  }, [selectedEmpCode, month, year]);

  function handleViewAttendance(empcode) {
    setSelectedEmpCode(empcode);
  }

  function handleCloseAttendance() {
    setSelectedEmpCode('');
    setAttendance([]);
    setSelectedEmployee(null);
  }

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  return (
    <div className="dashboardPage">
      <div className="dashboardBlob dashboardBlobOne" />
      <div className="dashboardBlob dashboardBlobTwo" />

      <div className="dashboardHeader">
        <h1 className="dashboardHeaderTitle">Monitor HOD&apos;s Attendance</h1>
        <p className="dashboardHeaderText">View attendance records for HOD and team members.</p>
      </div>

      <div className="dashboardAttendance">
        {!selectedEmpCode ? (
          <div className="hodTableWrapper">
            <div className="scrollableTableWrapper hodListWrapper">
              <table className="attendanceTable hodListTable">
                <thead>
                  <tr>
                    <th>Employee ID</th>
                    <th>Employee Name</th>
                    <th>Department</th>
                    <th>Section</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {ALL_HOD_IDS.map((hod) => {
                    const profile = hodProfiles[hod.id];
                    return (
                      <tr key={hod.id}>
                        <td>{hod.id}</td>
                        <td>{profile?.EmpName || '-'}</td>
                        <td>{profile?.DeptCode || '-'}</td>
                        <td>{profile?.Section || '-'}</td>
                        <td>
                          <button
                            type="button"
                            className="viewAttendanceButton"
                            onClick={() => handleViewAttendance(hod.id)}
                          >
                            👁️ View Attendance
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <>
            <div className="hodFilterBar">
              <button
                type="button"
                className="backToListButton"
                onClick={handleCloseAttendance}
              >
                ← Back to List
              </button>

              <div className="hodFilterField">
                <label>Month:</label>
                <select
                  value={month}
                  onChange={(e) => setMonth(parseInt(e.target.value))}
                >
                  {monthNames.map((m, i) => (
                    <option key={i} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <div className="hodFilterField">
                <label>Year:</label>
                <select
                  value={year}
                  onChange={(e) => setYear(parseInt(e.target.value))}
                >
                  {[2023, 2024, 2025, 2026, 2027].map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="hodSelectedInfo">
              <div>
                <strong>Selected:</strong>
                <span className="hodHighlightValue">
                  {selectedEmployee?.EmpName || selectedEmpCode}
                </span>
              </div>
              <div>
                <strong>Department:</strong>
                <span className="hodHighlightValue">
                  {selectedEmployee?.DeptCode || '-'}
                </span>
              </div>
            </div>

            {loading ? (
              <p>Loading attendance data...</p>
            ) : attendance.length === 0 ? (
              <p>No attendance records found for the selected employee.</p>
            ) : (
              <div className="hodTableWrapper">
                <div className="scrollableTableWrapper attendanceDetailWrapper">
                  <table className="attendanceTable attendanceDetailTable">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Day</th>
                        <th>Status</th>
                        <th>Check-In</th>
                        <th>Check-Out</th>
                        <th>Work Hours</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attendance.map((record, idx) => {
                        const date = new Date(record.AttDate);
                        const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
                        const rowKey = `${record.Empcode || selectedEmpCode}-${record.AttDate ? new Date(record.AttDate).toISOString() : idx}`;
                        const workHours = calculateWorkHours(record.InTime, record.OutTime) || record.WorkHours || '-';
                        return (
                          <tr key={rowKey}>
                            <td>{date.toLocaleDateString()}</td>
                            <td>{dayName}</td>
                            <td>{record.AttType || '-'}</td>
                            <td>{record.InTime || '-'}</td>
                            <td>{record.OutTime || '-'}</td>
                            <td>{workHours}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}