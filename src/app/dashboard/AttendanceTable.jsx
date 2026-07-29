'use client';

import { useState } from 'react';
import Link from 'next/link';

function timeParts(value) {
  if (!value) return { hour: '08', minute: '00', period: 'AM' };

  const text = value instanceof Date ? value.toISOString() : String(value);
  const match = text.match(/(?:T|\s)(\d{2}):(\d{2})/) || text.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return { hour: '08', minute: '00', period: 'AM' };

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
  return `${hour}:${minute} ${period}`;
}

function rowKey(row, index) {
  return `${row.Empcode || 'emp'}-${row.AttDate ? new Date(row.AttDate).toISOString() : index}`;
}

function TimeEditor({ value, onChange, onSave, saving }) {
  return (
    <div className="attendanceTimeEditor">
      <select value={value.hour} onChange={(event) => onChange({ ...value, hour: event.target.value })} aria-label="Hour">
        {Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0')).map((hour) => <option key={hour}>{hour}</option>)}
      </select>
      <select value={value.minute} onChange={(event) => onChange({ ...value, minute: event.target.value })} aria-label="Minute">
        {['00', '15', '30', '45'].map((minute) => <option key={minute}>{minute}</option>)}
      </select>
      <select value={value.period} onChange={(event) => onChange({ ...value, period: event.target.value })} aria-label="AM or PM">
        <option>AM</option><option>PM</option>
      </select>
      <button type="button" className="attendanceTimeSave" onClick={onSave} disabled={saving} aria-label="Save time">
        {saving ? '…' : '✓'}
      </button>
    </div>
  );
}

export default function AttendanceTable({ attendance, canApplyLeave }) {
  const [times, setTimes] = useState(() => Object.fromEntries(attendance.map((row, index) => {
    const key = rowKey(row, index);
    return [key, { in: timeParts(row.ActInTime || row.InTime), out: timeParts(row.ActOutTime || row.OutTime) }];
  })));
  // Tracks which rows currently show the dropdown editors. Defaults to
  // closed (plain-text view) for every row; the pencil icon toggles it open.
  const [editingRows, setEditingRows] = useState({});
  const [saving, setSaving] = useState('');
  const [message, setMessage] = useState('');

  function toggleEdit(key) {
    setEditingRows((current) => ({ ...current, [key]: !current[key] }));
  }

  async function saveTime(row, index, timeField) {
    const key = rowKey(row, index);
    const selectedTime = to24Hour(times[key][timeField]);
    const displayTime = times[key][timeField];

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
      <div className="dashboardAttendanceTableWrap">
        <table className="attendanceTable">
          <thead><tr><th>Employee ID</th><th>Employee Name</th><th>Department</th><th>Date</th><th>Attendance</th><th>In Time</th><th>Out Time</th><th>Apply For a Leave</th><th>Edit</th></tr></thead>
          <tbody>
            {attendance.map((row, index) => {
              const key = rowKey(row, index);
              const isEditing = !!editingRows[key];
              return <tr key={key}>
                <td>{row.EmployeeCode}</td><td>{row.EmployeeName}</td><td>{row.Department}</td>
                <td>{row.AttDate ? new Date(row.AttDate).toLocaleDateString() : '-'}</td><td>{row.AttType || '-'}</td>
                <td>
                  {isEditing
                    ? <TimeEditor value={times[key].in} onChange={(value) => setTimes((current) => ({ ...current, [key]: { ...current[key], in: value } }))} onSave={() => saveTime(row, index, 'in')} saving={saving === `${key}-in`} />
                    : <span className="attendanceTimeDisplay">{formatTime(times[key].in)}</span>}
                </td>
                <td>
                  {isEditing
                    ? <TimeEditor value={times[key].out} onChange={(value) => setTimes((current) => ({ ...current, [key]: { ...current[key], out: value } }))} onSave={() => saveTime(row, index, 'out')} saving={saving === `${key}-out`} />
                    : <span className="attendanceTimeDisplay">{formatTime(times[key].out)}</span>}
                </td>
                <td>{canApplyLeave ? <Link href={`/apply-leave?empcode=${row.Empcode}`}><button type="button" className="applyLeaveButton">Apply Now</button></Link> : <button type="button" className="applyLeaveButton" disabled>Not Eligible</button>}</td>
                <td>
                  <button
                    type="button"
                    className="attendanceEditIconButton"
                    onClick={() => toggleEdit(key)}
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