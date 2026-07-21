'use client';

import { useEffect, useState } from 'react';
import { formatApproverList } from '@/lib/leaveUtils';
import './LeaveApprovalPanel.css';

export default function LeaveApprovalPanel() {
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [myRequests, setMyRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  async function loadData() {
    setLoading(true);
    try {
      const res = await fetch('/api/leave');
      const data = await res.json();
      if (res.ok) {
        setPendingApprovals(data.pendingApprovals || []);
        setMyRequests(data.myRequests || []);
      }
    } catch (err) {
      console.error('Failed to load leave approvals:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove(id, currentApprover, approvalFlow) {
    try {
      const res = await fetch(`/api/leave/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approverId: currentApprover,
          decision: 'APPROVED',
          currentApprover,
          approvalFlow,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Approval failed');
      }

      setMessage(`Approved successfully. ${data.nextApprover ? `Next approver: ${data.nextApprover}` : 'Request completed.'}`);
      await loadData();
    } catch (err) {
      setMessage(err.message || 'Approval failed');
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div className="leaveApprovalPanel">
      <h2>Leave Approvals</h2>
      {message && <p className="leaveApprovalMessage">{message}</p>}

      <div className="leaveApprovalSection">
        <h3>Pending for your approval</h3>
        {loading ? (
          <p>Loading...</p>
        ) : pendingApprovals.length === 0 ? (
          <p>No pending approvals.</p>
        ) : (
          <ul className="leaveApprovalList">
            {pendingApprovals.map((request) => (
              <li key={request.Id} className="leaveApprovalItem">
                <div>
                  <strong>{request.ApplicantName || request.ApplicantId}</strong>
                  <div>{request.LeaveType} • {request.TotalDays} day(s)</div>
                  <div>Status: {request.Status}</div>
                </div>
                <button
                  type="button"
                  className="applyLeaveButton"
                  onClick={() => handleApprove(request.Id, request.CurrentApprover, request.ApprovalFlow)}
                >
                  Approve
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="leaveApprovalSection">
        <h3>Your leave requests</h3>
        {myRequests.length === 0 ? (
          <p>No leave requests yet.</p>
        ) : (
          <ul className="leaveApprovalList">
            {myRequests.map((request) => (
              <li key={request.Id} className="leaveApprovalItem">
                <div>
                  <strong>{request.LeaveType}</strong>
                  <div>{request.Reason}</div>
                  <div>Status: {request.Status}</div>
                  <div>Current approver: {request.CurrentApprover || '-'}</div>
                  <div>Approved by: {formatApproverList(request.ApprovedBy)}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
