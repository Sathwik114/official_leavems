'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

function timeParts(value) {
  if (!value) return { hour: '', minute: '00', period: 'AM' };

  const text = value instanceof Date ? value.toISOString() : String(value);
  const match = text.match(/(?:T|\s)(\d{2}):(\d{2})/) || text.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return { hour: '', minute: '00', period: 'AM' };

  const hour24 = Number(match[1]);
  return {
    hour: String(hour24 % 12 || 12).padStart(2, '0'),
    minute: match[2],
    period: hour24 >= 12 ? 'PM' : 'AM',
  };
}

function to24Hour({ hour, minute, period }) {
  let hours = Number(hour) % 12;
  if (period === 'PM') hours += 12;
  return `${String(hours).padStart(2, '0')}:${minute}`;
}

// Plain-text display for a saved/current time value, e.g. "08:00 AM".
function formatTime({ hour, minute, period }) {
  if (!hour) return '-';
  return `${hour}:${minute} ${period}`;
}

function rowKey(row, index) {
  return `${row.Empcode || 'emp'}-${row.AttDate ? new Date(row.AttDate).toISOString() : index}`;
}

function initialRowTimes(row) {
  return {
    in: timeParts(row.ActInTime || row.InTime),
    out: timeParts(row.ActOutTime || row.OutTime),
  };
}

function TimeEditor({ value, onChange, onSave, saving }) {
  return (
    <div className="attendanceTimeEditor">
      <select value={value.hour} onChange={(event) => onChange({ ...value, hour: event.target.value })} aria-label="Hour">
        <option value="">HH</option>
        {Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0')).map((hour) => <option key={hour} value={hour}>{hour}</option>)}
      </select>
      <select value={value.minute} onChange={(event) => onChange({ ...value, minute: event.target.value })} aria-label="Minute">
        {['00', '15', '30', '45'].map((minute) => <option key={minute} value={minute}>{minute}</option>)}
      </select>
      <select value={value.period} onChange={(event) => onChange({ ...value, period: event.target.value })} aria-label="AM or PM">
        <option value="AM">AM</option><option value="PM">PM</option>
      </select>
      <button type="button" className="attendanceTimeSave" onClick={onSave} disabled={saving} aria-label="Save time">
        {saving ? '…' : '✓'}
      </button>
    </div>
  );
}

export default function AttendanceTable({ empcode, employee, attendance, canApplyLeave }) {
  const [displayAttendance, setDisplayAttendance] = useState(attendance);
  const [viewMode, setViewMode] = useState('current');
  const [loadingPrevious, setLoadingPrevious] = useState(false);
  const [times, setTimes] = useState(() => Object.fromEntries(attendance.map((row, index) => {
    const key = rowKey(row, index);
    return [key, initialRowTimes(row)];
  })));
  // Tracks which rows currently show the dropdown editors. Defaults to
  // closed (plain-text view) for every row; the pencil icon toggles it open.
  const [editingRows, setEditingRows] = useState({});
  const [saving, setSaving] = useState('');
  const [message, setMessage] = useState('');

  const showPreviousButton = new Date().getDate() <= 3;

  useEffect(() => {
    setDisplayAttendance(attendance);
    setViewMode('current');
  }, [attendance]);

  useEffect(() => {
    setTimes(Object.fromEntries(displayAttendance.map((row, index) => {
      const key = rowKey(row, index);
      return [key, initialRowTimes(row)];
    })));
    setEditingRows({});
  }, [displayAttendance]);

  function getRowTimes(row, key) {
    return times[key] || initialRowTimes(row);
  }

  function resetRowTimes(row, key) {
    setTimes((current) => ({ ...current, [key]: initialRowTimes(row) }));
  }

  function toggleEdit(key, row) {
    setEditingRows((current) => {
      const nextValue = !current[key];
      if (!nextValue) {
        resetRowTimes(row, key);
      }
      return { ...current, [key]: nextValue };
    });
  }

  async function loadPreviousMonthRows() {
    if (!empcode) return;
    setLoadingPrevious(true);
    setMessage('');

    try {
      const res = await fetch(`/api/employee?empcode=${encodeURIComponent(empcode)}&includePreviousTopRows=true`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load previous month rows.');

      const previousRows = (data.attendance || []).map((row) => ({
        ...row,
        EmployeeCode: row.EmployeeCode || row.Empcode || employee?.Empcode || '-',
        EmployeeName: row.EmployeeName || employee?.EmpName || row.Empcode || '-',
        Department: row.Department || employee?.DeptCode || '-',
      }));

      setDisplayAttendance(previousRows);
      setViewMode('previous');
      if (!previousRows.length) {
        setMessage('No previous month rows were found.');
      }
    } catch (err) {
      setMessage(err.message || 'Unable to load previous month rows.');
    } finally {
      setLoadingPrevious(false);
    }
  }

  async function saveTime(row, index, timeField) {
    const key = rowKey(row, index);
    const selected = times[key][timeField];
    if (!selected.hour) {
      setMessage('Please select a valid time before saving.');
      return;
    }

    const selectedTime = to24Hour(selected);
    const displayTime = selected;

    if (!window.confirm(`Save ${timeField === 'in' ? 'In' : 'Out'} Time as ${displayTime.hour}:${displayTime.minute} ${displayTime.period}?`)) {
      return;
    }

    setSaving(`${key}-${timeField}`);
    setMessage('');
    try {
      const response = await fetch('/api/attendance/time', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empcode: row.Empcode,
          attendanceDate: row.AttDate,
          timeField,
          timeValue: selectedTime,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to save attendance time.');
      setMessage(`${timeField === 'in' ? 'In' : 'Out'} time saved.`);
      // Saved successfully — collapse back to the plain-text view for this row.
      setEditingRows((current) => ({ ...current, [key]: false }));
    } catch (error) {
      setMessage(error.message || 'Unable to save attendance time.');
    } finally {
      setSaving('');
    }
  }

  return (
    <>
      {message && <p className="attendanceTimeMessage">{message}</p>}
      <div className="attendanceTableToolbar">
        {showPreviousButton && (
          <button type="button" onClick={loadPreviousMonthRows} disabled={loadingPrevious || viewMode === 'previous'}>
            {loadingPrevious ? 'Loading…' : 'Show Previous Month'}
          </button>
        )}
        {viewMode === 'previous' && (
          <button type="button" onClick={() => { setDisplayAttendance(attendance); setViewMode('current'); setMessage('Showing current month attendance.'); }}>
            Show Current Month
          </button>
        )}
      </div>
      <div className="dashboardAttendanceTableWrap">
        <table className="attendanceTable">
          <thead><tr><th>Employee ID</th><th>Employee Name</th><th>Department</th><th>Date</th><th>Attendance</th><th>In Time</th><th>Out Time</th><th>Apply For a Leave</th><th>Edit</th></tr></thead>
          <tbody>
            {displayAttendance.map((row, index) => {
              const key = rowKey(row, index);
              const isEditing = !!editingRows[key];
              return <tr key={key}>
                <td>{row.EmployeeCode}</td><td>{row.EmployeeName}</td><td>{row.Department}</td>
                <td>{row.AttDate ? new Date(row.AttDate).toLocaleDateString() : '-'}</td><td>{row.AttType || '-'}</td>
                <td>
                  {isEditing
                    ? <TimeEditor value={getRowTimes(row, key).in} onChange={(value) => setTimes((current) => ({ ...current, [key]: { ...current[key], in: value } }))} onSave={() => saveTime(row, index, 'in')} saving={saving === `${key}-in`} />
                    : <span className="attendanceTimeDisplay">{formatTime(getRowTimes(row, key).in)}</span>}
                </td>
                <td>
                  {isEditing
                    ? <TimeEditor value={getRowTimes(row, key).out} onChange={(value) => setTimes((current) => ({ ...current, [key]: { ...current[key], out: value } }))} onSave={() => saveTime(row, index, 'out')} saving={saving === `${key}-out`} />
                    : <span className="attendanceTimeDisplay">{formatTime(getRowTimes(row, key).out)}</span>}
                </td>
                <td>{canApplyLeave ? <Link href={`/apply-leave?empcode=${row.Empcode}`}><button type="button" className="applyLeaveButton">Apply Now</button></Link> : <button type="button" className="applyLeaveButton" disabled>Not Eligible</button>}</td>
                <td>
                  <button
                    type="button"
                    className="attendanceEditIconButton"
                    onClick={() => toggleEdit(key, row)}
                    aria-label={isEditing ? 'Close time editor' : 'Edit time'}
                    title={isEditing ? 'Close' : 'Edit'}
                  >
                    {isEditing ? '✕' : '✏️'}
                  </button>
                </td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}