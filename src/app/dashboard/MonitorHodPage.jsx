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

// Sorts attendance records by AttDate, newest first.
function sortAttendanceDesc(records) {
  return [...records].sort((a, b) => new Date(b.AttDate) - new Date(a.AttDate));
}

// Sorts leave records by FromDate, newest first.
function sortLeaveDesc(records) {
  return [...records].sort((a, b) => new Date(b.FromDate) - new Date(a.FromDate));
}

const ALL_HOD_IDS = [
  ...LEAVE_ROLE_RULES.mf.ids.map((id) => ({ id, name: `${id} - MF` })),
  ...LEAVE_ROLE_RULES.adm.ids.map((id) => ({ id, name: `${id} - ADM` })),
  ...LEAVE_ROLE_RULES.vip.ids.map((id) => ({ id, name: `${id} - VIP` })),
];

export default function MonitorHodPage() {
  // viewMode: 'list' | 'attendance' | 'leave'
  const [viewMode, setViewMode] = useState('list');
  const [selectedEmpCode, setSelectedEmpCode] = useState('');

  const [attendance, setAttendance] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [loading, setLoading] = useState(false);

  const [leaveRecords, setLeaveRecords] = useState([]);
  const [leaveEmployee, setLeaveEmployee] = useState(null);
  const [leaveLoading, setLeaveLoading] = useState(false);

  const [hodProfiles, setHodProfiles] = useState({});
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [exporting, setExporting] = useState(false);
  const [exportingLeave, setExportingLeave] = useState(false);

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

  // Loads OnlineLeaveEntry records for the employee, filtered by year.
  // Header info (Empname/Department/Section) comes from the payroll
  // EmpMast lookup, not from the OnlineLeaveEntry rows.
  async function loadLeave(empcode) {
    if (!empcode) return;

    setLeaveLoading(true);
    try {
      const res = await fetch(`/api/leave-history?empcode=${encodeURIComponent(empcode)}&year=${year}`);
      const data = await res.json();
      if (res.ok) {
        setLeaveRecords(sortLeaveDesc(data.leave || []));
        setLeaveEmployee(data.employee || null);
      } else {
        setLeaveRecords([]);
        setLeaveEmployee(null);
      }
    } catch (err) {
      console.error('Failed to load leave records:', err);
      setLeaveRecords([]);
      setLeaveEmployee(null);
    } finally {
      setLeaveLoading(false);
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
    if (selectedEmpCode && viewMode === 'attendance') {
      loadAttendance(selectedEmpCode);
    }
  }, [selectedEmpCode, viewMode, month, year]);

  useEffect(() => {
    if (selectedEmpCode && viewMode === 'leave') {
      loadLeave(selectedEmpCode);
    }
  }, [selectedEmpCode, viewMode, year]);

  function handleViewAttendance(empcode) {
    setSelectedEmpCode(empcode);
    setViewMode('attendance');
  }

  function handleViewLeave(empcode) {
    setSelectedEmpCode(empcode);
    setViewMode('leave');
  }

  function handleCloseDetail() {
    setSelectedEmpCode('');
    setViewMode('list');
    setAttendance([]);
    setSelectedEmployee(null);
    setLeaveRecords([]);
    setLeaveEmployee(null);
  }

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  // Builds the .xlsx file from the currently loaded attendance rows and
  // triggers a browser download. Uses the `xlsx` (SheetJS) package.
  async function handleDownloadExcel() {
    if (!attendance.length) return;

    setExporting(true);
    try {
      const XLSX = await import('xlsx');

      const rows = attendance.map((record) => ({
        Date: record.AttDate ? new Date(record.AttDate).toLocaleDateString() : '-',
        'Attendance Type': record.AttType || '-',
        'In Time': record.InTime || '-',
        'Out Time': record.OutTime || '-',
      }));

      const worksheet = XLSX.utils.json_to_sheet(rows);
      worksheet['!cols'] = [{ wch: 14 }, { wch: 18 }, { wch: 14 }, { wch: 14 }];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance');

      const empLabel = (selectedEmployee?.EmpName || selectedEmpCode || 'employee')
        .toString()
        .replace(/[^a-z0-9]+/gi, '_');
      const fileName = `Attendance_${empLabel}_${monthNames[month - 1]}_${year}.xlsx`;

      XLSX.writeFile(workbook, fileName);
    } catch (err) {
      console.error('Failed to export attendance to Excel:', err);
    } finally {
      setExporting(false);
    }
  }

  // Builds the .xlsx file from the currently loaded leave rows and
  // triggers a browser download. Uses the `xlsx` (SheetJS) package.
  async function handleDownloadLeaveExcel() {
    if (!leaveRecords.length) return;

    setExportingLeave(true);
    try {
      const XLSX = await import('xlsx');

      const rows = leaveRecords.map((record) => ({
        'From Date': record.FromDate ? new Date(record.FromDate).toLocaleDateString() : '-',
        'To Date': record.ToDate ? new Date(record.ToDate).toLocaleDateString() : '-',
        'From Time': record.FromTime || '-',
        'To Time': record.ToTime || '-',
        'Leave Type': record.LeaveType || '-',
        'No. of Days': record.NoofDays ?? '-',
        Reason: record.Reason || '-',
      }));

      const worksheet = XLSX.utils.json_to_sheet(rows);
      worksheet['!cols'] = [
        { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 12 },
        { wch: 16 }, { wch: 12 }, { wch: 30 },
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Leave');

      const empLabel = (leaveEmployee?.EmpName || selectedEmpCode || 'employee')
        .toString()
        .replace(/[^a-z0-9]+/gi, '_');
      const fileName = `Leave_${empLabel}_${year}.xlsx`;

      XLSX.writeFile(workbook, fileName);
    } catch (err) {
      console.error('Failed to export leave to Excel:', err);
    } finally {
      setExportingLeave(false);
    }
  }

  return (
    <div className="dashboardPage">
      <div className="dashboardBlob dashboardBlobOne" />
      <div className="dashboardBlob dashboardBlobTwo" />

      <div className="dashboardAttendance">
        {viewMode === 'list' ? (
          <div className="hodTableWrapper">
            <div className="scrollableTableWrapper hodListWrapper">
              <table className="attendanceTable hodListTable">
                <thead>
                  <tr>
                    <th>Employee ID</th>
                    <th>Employee Name</th>
                    <th>Department</th>
                    <th>Section</th>
                    <th>View</th>
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
                        <td className="hodActionsCell">
                          <button
                            type="button"
                            className="viewAttendanceButton"
                            onClick={() => handleViewAttendance(hod.id)}
                          >
                            👁️ View Attendance
                          </button>
                          <button
                            type="button"
                            className="viewLeaveButton"
                            onClick={() => handleViewLeave(hod.id)}
                          >
                            📋 View Leave
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : viewMode === 'attendance' ? (
          <>
            <div className="hodFilterBar">
              <button
                type="button"
                className="backToListButton"
                onClick={handleCloseDetail}
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
                <input
                  type="number"
                  className="yearInput"
                  value={year}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    setYear(Number.isNaN(val) ? new Date().getFullYear() : val);
                  }}
                  min="2000"
                  max="2100"
                />
              </div>

              <button
                type="button"
                className="downloadExcelButton"
                onClick={handleDownloadExcel}
                disabled={exporting || loading || attendance.length === 0}
              >
                {exporting ? 'Exporting…' : '⬇️ Download Excel'}
              </button>
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
                        <th>Attendance Type</th>
                        <th>In Time</th>
                        <th>Out Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attendance.map((record, idx) => {
                        const date = new Date(record.AttDate);
                        const rowKey = `${record.Empcode || selectedEmpCode}-${record.AttDate ? new Date(record.AttDate).toISOString() : idx}`;
                        return (
                          <tr key={rowKey}>
                            <td>{date.toLocaleDateString()}</td>
                            <td>{record.AttType || '-'}</td>
                            <td>{record.InTime || '-'}</td>
                            <td>{record.OutTime || '-'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="hodFilterBar">
              <button
                type="button"
                className="backToListButton"
                onClick={handleCloseDetail}
              >
                ← Back to List
              </button>

              <div className="hodFilterField">
                <label>Year:</label>
                <input
                  type="number"
                  className="yearInput"
                  value={year}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    setYear(Number.isNaN(val) ? new Date().getFullYear() : val);
                  }}
                  min="2000"
                  max="2100"
                />
              </div>

              <button
                type="button"
                className="downloadExcelButton"
                onClick={handleDownloadLeaveExcel}
                disabled={exportingLeave || leaveLoading || leaveRecords.length === 0}
              >
                {exportingLeave ? 'Exporting…' : '⬇️ Download Excel'}
              </button>
            </div>

            <div className="leaveInfoGrid">
              <div>
                <strong>Empcode:</strong>
                <span className="hodHighlightValue">
                  {leaveEmployee?.Empcode || selectedEmpCode}
                </span>
              </div>
              <div>
                <strong>Empname:</strong>
                <span className="hodHighlightValue">
                  {leaveEmployee?.EmpName || '-'}
                </span>
              </div>
              <div>
                <strong>Department:</strong>
                <span className="hodHighlightValue">
                  {leaveEmployee?.DeptCode || '-'}
                </span>
              </div>
              <div>
                <strong>Section:</strong>
                <span className="hodHighlightValue">
                  {leaveEmployee?.Section || '-'}
                </span>
              </div>
            </div>

            {leaveLoading ? (
              <p>Loading leave records...</p>
            ) : leaveRecords.length === 0 ? (
              <p>No leave records found for the selected employee.</p>
            ) : (
              <div className="hodTableWrapper">
                <div className="scrollableTableWrapper leaveDetailWrapper">
                  <table className="attendanceTable leaveDetailTable">
                    <thead>
                      <tr>
                        <th>From Date</th>
                        <th>To Date</th>
                        <th>From Time</th>
                        <th>To Time</th>
                        <th>Leave Type</th>
                        <th>No. of Days</th>
                        <th>Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leaveRecords.map((record, idx) => {
                        const rowKey = `${record.Empcode || selectedEmpCode}-${record.FromDate || idx}-${idx}`;
                        return (
                          <tr key={rowKey}>
                            <td>{record.FromDate ? new Date(record.FromDate).toLocaleDateString() : '-'}</td>
                            <td>{record.ToDate ? new Date(record.ToDate).toLocaleDateString() : '-'}</td>
                            <td>{record.FromTime || '-'}</td>
                            <td>{record.ToTime || '-'}</td>
                            <td>{record.LeaveType || '-'}</td>
                            <td>{record.NoofDays ?? '-'}</td>
                            <td>{record.Reason || '-'}</td>
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