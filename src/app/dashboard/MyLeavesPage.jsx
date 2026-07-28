'use client';

import './MyLeavesPage.css';
import { useEffect, useState, useMemo } from 'react';
import * as XLSX from 'xlsx';

function truncateReason(reason) {
  if (!reason) return '-';
  if (reason.length <= 10) return reason;
  return reason.slice(0, 10) + '...';
}

function formatDisplayDate(value) {
  if (!value) return '-';
  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) return '-';
  return parsedDate.toLocaleDateString('en-GB');
}

export default function MyLeavesPage() {
  const [myRequests, setMyRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const res = await fetch('/api/leave');
        const data = await res.json();
        if (res.ok) {
          setMyRequests(data.myRequests || []);
        }
      } catch (err) {
        console.error('Failed to load leave requests:', err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const yearOptions = useMemo(() => {
    const years = new Set();
    myRequests.forEach((request) => {
      const requestDateValue = request.DateApplied || request.CreatedAt || request.StartDate;
      if (!requestDateValue) return;
      const requestDate = new Date(requestDateValue);
      if (Number.isNaN(requestDate.getTime())) return;
      years.add(requestDate.getFullYear());
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [myRequests]);

  const filteredRequests = useMemo(() => {
    return myRequests.filter((request) => {
      const requestDateValue = request.DateApplied || request.CreatedAt || request.StartDate;
      if (!requestDateValue) return false;
      const requestDate = new Date(requestDateValue);
      if (Number.isNaN(requestDate.getTime())) return false;

      if (dateFilter && requestDate.toISOString().split('T')[0] !== dateFilter) {
        return false;
      }
      if (monthFilter && String(requestDate.getMonth() + 1).padStart(2, '0') !== monthFilter) {
        return false;
      }
      if (yearFilter && String(requestDate.getFullYear()) !== yearFilter) {
        return false;
      }
      return true;
    });
  }, [myRequests, dateFilter, monthFilter, yearFilter]);

  const hasActiveFilters = dateFilter || monthFilter || yearFilter;
  const clearAllFilters = () => {
    setDateFilter('');
    setMonthFilter('');
    setYearFilter('');
  };

  const monthOptions = [
    { value: '01', label: 'January' },
    { value: '02', label: 'February' },
    { value: '03', label: 'March' },
    { value: '04', label: 'April' },
    { value: '05', label: 'May' },
    { value: '06', label: 'June' },
    { value: '07', label: 'July' },
    { value: '08', label: 'August' },
    { value: '09', label: 'September' },
    { value: '10', label: 'October' },
    { value: '11', label: 'November' },
    { value: '12', label: 'December' },
  ];

  const totalRows = filteredRequests.length;

  const handleExportExcel = () => {
    const exportRows = filteredRequests.map((request, index) => ({
      'S.No': totalRows - index,
      'Date Applied': formatDisplayDate(request.DateApplied || request.CreatedAt || request.StartDate),
      'Applicant ID': request.ApplicantId || '-',
      'Applicant Name': request.ApplicantName || '-',
      'Department': request.Department || '-',
      'Section': request.Section || '-',
      'Leave Type': request.LeaveType || '-',
      'From Time': request.FromTime || '-',
      'To Time': request.ToTime || '-',
      'Reason': request.Reason || '-',
      'Status': request.Status || '-',
      'Attachment': request.AttachmentName || '-',
      'Current Approver': request.CurrentApprover || '-',
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'My Leaves');

    const today = new Date().toISOString().split('T')[0];
    XLSX.writeFile(workbook, `my-leaves-${today}.xlsx`);
  };

  return (
    <div className="dashboardPage">
      <div className="dashboardBlob dashboardBlobOne" />
      <div className="dashboardBlob dashboardBlobTwo" />

      <div className="dashboardHeader">
        <h1 className="dashboardHeaderTitle">My Leaves</h1>
      </div>

      <div className="dashboardAttendance">
        <div className="tableFilterBar">
          <label htmlFor="dateFilter">Filter by Date:</label>
          <input
            type="date"
            id="dateFilter"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
          />

          <label htmlFor="monthFilter">Month:</label>
          <select
            id="monthFilter"
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
          >
            <option value="">All</option>
            {monthOptions.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>

          <label htmlFor="yearFilter">Year:</label>
          <input
            type="text"
            id="yearFilter"
            list="yearOptionsList"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            placeholder="e.g. 2026"
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value.replace(/[^0-9]/g, ''))}
            className="yearFilterInput"
          />
          <datalist id="yearOptionsList">
            {yearOptions.map((y) => (
              <option key={y} value={y} />
            ))}
          </datalist>

          {hasActiveFilters && (
            <button type="button" onClick={clearAllFilters} className="clearFilterBtn">
              Clear
            </button>
          )}

          <button
            type="button"
            onClick={handleExportExcel}
            className="exportExcelBtn"
            disabled={filteredRequests.length === 0}
          >
            Download Excel
          </button>
        </div>

        {loading ? (
          <p>Loading...</p>
        ) : filteredRequests.length === 0 ? (
          <p>No leave requests found.</p>
        ) : (
          <div className="tableScrollWrapper">
            <table className="attendanceTable">
              <thead>
                <tr>
                  <th>S.No</th>
                  <th>Date Applied</th>
                  <th>Applicant ID</th>
                  <th>Applicant Name</th>
                  <th>Department</th>
                  <th>Section</th>
                  <th>Leave Type</th>
                  <th>From Time</th>
                  <th>To Time</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th>Attachment</th>
                  <th>Current Approver</th>
                </tr>
              </thead>
              <tbody>
                {filteredRequests.map((request, index) => (
                  <tr key={request.Id}>
                    <td>{totalRows - index}</td>
                    <td>{formatDisplayDate(request.DateApplied || request.CreatedAt || request.StartDate)}</td>
                    <td>{request.ApplicantId || '-'}</td>
                    <td>{request.ApplicantName || '-'}</td>
                    <td>{request.Department || '-'}</td>
                    <td>{request.Section || '-'}</td>
                    <td>{request.LeaveType}</td>
                    <td>{request.FromTime || '-'}</td>
                    <td>{request.ToTime || '-'}</td>
                    <td title={request.Reason || ''}>{truncateReason(request.Reason)}</td>
                    <td>{request.Status}</td>
                    <td>
                      {request.TranId && request.AttachmentName ? (
                        <a
                          href={`/api/leave/document/${request.TranId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: '#2563eb', textDecoration: 'underline' }}
                        >
                          {request.AttachmentName}
                        </a>
                      ) : (
                        request.AttachmentName || '-'
                      )}
                    </td>
                    <td>{request.CurrentApprover || '-'}</td>
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