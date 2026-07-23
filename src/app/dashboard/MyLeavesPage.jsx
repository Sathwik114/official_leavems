'use client';

import './MyLeavesPage.css';
import { useEffect, useState, useMemo } from 'react';
import { formatApproverList } from '@/lib/leaveUtils';

function truncateReason(reason) {
  if (!reason) return '-';
  if (reason.length <= 10) return reason;
  return reason.slice(0, 10) + '...';
}

export default function MyLeavesPage() {
  const [myRequests, setMyRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState('');

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

  const filteredRequests = useMemo(() => {
    if (!dateFilter) return myRequests;
    return myRequests.filter((request) => {
      if (!request.CreatedAt) return false;
      const requestDate = new Date(request.CreatedAt).toISOString().split('T')[0];
      return requestDate === dateFilter;
    });
  }, [myRequests, dateFilter]);

  const totalRows = filteredRequests.length;

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
          {dateFilter && (
            <button type="button" onClick={() => setDateFilter('')} className="clearFilterBtn">
              Clear
            </button>
          )}
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
                  <th>Shift</th>
                  <th>Employee Type</th>
                  <th>Leave Type</th>
                  <th>From Time</th>
                  <th>To Time</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th>Attachment</th>
                  <th>Current Approver</th>
                  <th>Approved By</th>
                </tr>
              </thead>
              <tbody>
                {filteredRequests.map((request, index) => (
                  <tr key={request.Id}>
                    <td>{totalRows - index}</td>
                    <td>{request.CreatedAt ? new Date(request.CreatedAt).toLocaleDateString('en-GB') : '-'}</td>
                    <td>{request.ApplicantId || '-'}</td>
                    <td>{request.ApplicantName || '-'}</td>
                    <td>{request.Department || '-'}</td>
                    <td>{request.Section || '-'}</td>
                    <td>{request.Shift || '-'}</td>
                    <td>{request.EmpType || '-'}</td>
                    <td>{request.LeaveType}</td>
                    <td>{request.FromTime || '-'}</td>
                    <td>{request.ToTime || '-'}</td>
                    <td title={request.Reason || ''}>{truncateReason(request.Reason)}</td>
                    <td>{request.Status}</td>
                    <td>{request.AttachmentName || '-'}</td>
                    <td>{request.CurrentApprover || '-'}</td>
                    <td>{formatApproverList(request.ApprovedBy)}</td>
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
