'use client';

import { useEffect, useState } from 'react';
import './page.css';
import './leave-approval.css';
import { formatApproverList, normalizeApproverList } from '@/lib/leaveUtils';

export default function LeaveApprovalsPage() {
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [approvedRequests, setApprovedRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [activeTab, setActiveTab] = useState('pending');

  async function loadData() {
    setLoading(true);
    try {
      const res = await fetch('/api/leave');
      const data = await res.json();
      if (res.ok) {
        setPendingApprovals(data.pendingApprovals || []);
        setApprovedRequests(data.approvedRequests || []);
      }
    } catch (err) {
      console.error('Failed to load leave approvals:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleBulkAction(decision, remarks = '') {
    if (selectedIds.size === 0) return;

    const selArray = Array.from(selectedIds);
    const first = pendingApprovals.find((p) => p.Id === selArray[0]);
    const approverId = first?.CurrentApproverId || first?.CurrentApprover || '';

    try {
      const res = await fetch('/api/leave/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selArray, approverId, decision: decision.toUpperCase(), remarks }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Bulk action failed');
      setMessage(decision === 'APPROVED' ? 'Selected requests approved.' : 'Selected requests rejected.');
      setSelectedIds(new Set());
      await loadData();
    } catch (err) {
      setMessage(err.message || 'Bulk action failed');
    }
  }

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  }

  function selectAllToggle() {
    if (selectedIds.size === pendingApprovals.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pendingApprovals.map((p) => p.Id)));
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  function formatApplicationDate(request) {
    const value = request.DateApplied || request.CreatedAt || request.StartDate;
    if (!value || Number.isNaN(new Date(value).getTime())) return '-';
    return new Date(value).toLocaleDateString('en-GB');
  }

  const renderRequestRow = (request, isPending = true, index = 0) => {
    const rowKey = request.Id ? `${request.Id}-${isPending ? 'pending' : 'approved'}-${index}` : `${isPending ? 'pending' : 'approved'}-${index}`;

    return (
      <tr key={rowKey}>
        {isPending && (
          <td style={{ textAlign: 'center' }}>
            <input type="checkbox" checked={selectedIds.has(request.Id)} onChange={() => toggleSelect(request.Id)} />
          </td>
        )}
        <td>{formatApplicationDate(request)}</td>
        <td>{request.ApplicantId || '-'}</td>
        <td>{request.ApplicantName || '-'}</td>
        <td>{request.Department || '-'}</td>
        <td>{request.Section || '-'}</td>
        <td>{request.Shift || '-'}</td>
        <td>{request.EmpType || '-'}</td>
        <td>{request.LeaveType}</td>
        <td>{request.TotalDays}</td>
        <td>{request.Reason}</td>
        <td>{request.AttachmentName || '-'}</td>
        <td>{request.CurrentApprover || '-'}</td>
        <td>{formatApproverList(request.ApprovedBy)}</td>
        <td>{request.Status}</td>
        <td>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button type="button" className="applyLeaveButton" onClick={() => setExpandedId(request.Id)}>
              View Form
            </button>
          </div>
        </td>
      </tr>
    );
  };

  const combined = pendingApprovals.concat(approvedRequests || []);
  const uniqueById = Array.from(new Map(combined.map((r) => [r.Id, r])).values());
  const activeRequest = expandedId ? uniqueById.find((r) => r.Id === expandedId) : null;

  async function handleApproveDetail() {
    if (!activeRequest) return;
    try {
      const res = await fetch(`/api/leave/${activeRequest.Id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approverId: activeRequest.CurrentApproverId || activeRequest.CurrentApprover,
          decision: 'APPROVED',
          currentApprover: activeRequest.CurrentApproverId || activeRequest.CurrentApprover,
          approvalFlow: activeRequest.ApprovalFlow,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Approval failed');
      setMessage(data.nextApprover ? `Approved. Next approver: ${data.nextApprover}` : 'Approved successfully.');
      setExpandedId(null);
      await loadData();
    } catch (err) {
      setMessage(err.message || 'Approval failed');
    }
  }

  async function handleRejectDetail() {
    if (!activeRequest) return;
    const reason = window.prompt('Rejection reason:');
    if (reason === null) return;
    try {
      const res = await fetch('/api/leave/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [activeRequest.Id], approverId: activeRequest.CurrentApproverId || activeRequest.CurrentApprover, decision: 'REJECTED', remarks: reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Reject failed');
      setMessage('Request rejected.');
      setExpandedId(null);
      await loadData();
    } catch (err) {
      setMessage(err.message || 'Reject failed');
    }
  }

  const approvedByList = activeRequest ? normalizeApproverList(activeRequest.ApprovedBy) : [];

  return (
    <div className="dashboardPage">
      <div className="dashboardBlob dashboardBlobOne" />
      <div className="dashboardBlob dashboardBlobTwo" />

      <div className="leaveTabBar">
        <button
          type="button"
          className={`leaveTabButton ${activeTab === 'pending' ? 'leaveTabButtonActive' : ''}`}
          onClick={() => setActiveTab('pending')}
        >
          New Leave Requests
        </button>
        <button
          type="button"
          className={`leaveTabButton ${activeTab === 'approved' ? 'leaveTabButtonActive' : ''}`}
          onClick={() => setActiveTab('approved')}
        >
          My Approved Requests
        </button>
      </div>

      <div className="leaveApprovalMessageWrap">
        {message && <p className="leaveApprovalMessage">{message}</p>}
      </div>

      {loading ? (
        <p className="leaveLoadingText">Loading...</p>
      ) : (
        <>
          {activeTab === 'pending' && (
            <div className="leaveTableCard">
              <h2>New Leave Requests</h2>
              {pendingApprovals.length === 0 ? (
                <p>No pending approvals.</p>
              ) : (
                <>
                  <table className="leaveNoScrollTable">
                    <thead>
                      <tr>
                        <th style={{ width: '40px', textAlign: 'center' }}>
                          <input type="checkbox" checked={selectedIds.size === pendingApprovals.length && pendingApprovals.length > 0} onChange={selectAllToggle} />
                        </th>
                        <th>Date Applied</th>
                        <th>Applicant ID</th>
                        <th>Applicant Name</th>
                        <th>Department</th>
                        <th>Section</th>
                        <th>Shift</th>
                        <th>Employee Type</th>
                        <th>Leave Type</th>
                        <th>Days</th>
                        <th>Reason</th>
                        <th>Attachment</th>
                        <th>Current Approver</th>
                        <th>Approved By</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingApprovals.map((request, index) => renderRequestRow(request, true, index))}
                    </tbody>
                  </table>
                  <div className="leaveBulkActionsRow">
                    <button className="applyLeaveButton" disabled={selectedIds.size === 0} onClick={() => handleBulkAction('APPROVED')}>Approve Selected</button>
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === 'approved' && (
            <div className="leaveTableCard leaveApprovedCard">
              <h2>My Approved Requests</h2>
              {approvedRequests.length === 0 ? (
                <p>No approved requests yet.</p>
              ) : (
                <table className="leaveNoScrollTable">
                  <thead>
                    <tr>
                      <th>Date Applied</th>
                      <th>Applicant ID</th>
                      <th>Applicant Name</th>
                      <th>Department</th>
                      <th>Section</th>
                      <th>Shift</th>
                      <th>Employee Type</th>
                      <th>Leave Type</th>
                      <th>Days</th>
                      <th>Reason</th>
                      <th>Attachment</th>
                      <th>Current Approver</th>
                      <th>Approved By</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {approvedRequests.map((request, index) => renderRequestRow(request, false, index))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}

      {activeRequest && (
        <div className="leaveDetailOverlay" onClick={() => setExpandedId(null)}>
          <div className="leaveDetailCardWrap" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="leaveDetailCloseButton" onClick={() => setExpandedId(null)}>
              ×
            </button>

            <div className="leaveDetailCard">
              <div className="leaveDetailTable">
                <div className="leaveDetailRow leaveDetailRowHeader">
                  <div className="leaveDetailCell leaveDetailCellLabel">Balance Leaves :-</div>
                  <div className="leaveDetailCell">EL :- {activeRequest.EarnLeaveBalance ?? 0}</div>
                  <div className="leaveDetailCell">SL :- {activeRequest.SickLeaveBalance ?? 0}</div>
                  <div className="leaveDetailCell leaveDetailCellDate">
                    Date of Application :- <span className="leaveDetailHighlight">
                      {formatApplicationDate(activeRequest)}
                    </span>
                  </div>
                </div>

                <div className="leaveDetailRow">
                  <div className="leaveDetailCell leaveDetailCellLabel">Employee Name :-</div>
                  <div className="leaveDetailCell leaveDetailCellValue">{activeRequest.ApplicantName}</div>
                  <div className="leaveDetailCell leaveDetailCellLabel">Employee ID :-</div>
                  <div className="leaveDetailCell leaveDetailCellValue">{activeRequest.ApplicantId}</div>
                </div>

                <div className="leaveDetailRow">
                  <div className="leaveDetailCell leaveDetailCellLabel">Department :-</div>
                  <div className="leaveDetailCell leaveDetailCellValue">{activeRequest.Department || '-'}</div>
                  <div className="leaveDetailCell leaveDetailCellLabel">Section :-</div>
                  <div className="leaveDetailCell leaveDetailCellValue">{activeRequest.Section || '-'}</div>
                </div>

                <div className="leaveDetailRow">
                  <div className="leaveDetailCell leaveDetailCellLabel">Shift :-</div>
                  <div className="leaveDetailCell leaveDetailCellValue">{activeRequest.Shift || '-'}</div>
                  <div className="leaveDetailCell leaveDetailCellLabel">Employee Type :-</div>
                  <div className="leaveDetailCell leaveDetailCellValue">{activeRequest.EmpType || '-'}</div>
                </div>

                <div className="leaveDetailRow">
                  <div className="leaveDetailCell leaveDetailCellLabel">Leave Type :-</div>
                  <div className="leaveDetailCell leaveDetailCellValue">{activeRequest.LeaveType}</div>
                  <div className="leaveDetailCell leaveDetailCellLabel">No of Days :-</div>
                  <div className="leaveDetailCell leaveDetailCellValue">{activeRequest.TotalDays}</div>
                </div>

                <div className="leaveDetailRow">
                  <div className="leaveDetailCell leaveDetailCellLabel">Leave Start Date :-</div>
                  <div className="leaveDetailCell leaveDetailCellValue">
                    {activeRequest.StartDate ? new Date(activeRequest.StartDate).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                  </div>
                  <div className="leaveDetailCell leaveDetailCellLabel">End Date :-</div>
                  <div className="leaveDetailCell leaveDetailCellValue">
                    {activeRequest.EndDate ? new Date(activeRequest.EndDate).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                  </div>
                </div>

                <div className="leaveDetailRow">
                  <div className="leaveDetailCell leaveDetailCellLabel">Contact Number :-</div>
                  <div className="leaveDetailCell leaveDetailCellValue">{activeRequest.ContactNumber || '-'}</div>
                  <div className="leaveDetailCell leaveDetailCellLabel">Reliever :-</div>
                  <div className="leaveDetailCell leaveDetailCellValue">{activeRequest.RelieverName || activeRequest.RelieverId || '-'}</div>
                </div>

                <div className="leaveDetailRow leaveDetailRowReason">
                  <div className="leaveDetailCell leaveDetailCellLabel">Reason :-</div>
                  <div className="leaveDetailCell leaveDetailCellValue leaveDetailCellSpan">{activeRequest.Reason || '-'}</div>
                </div>

                <div className="leaveDetailRow leaveDetailRowApprover">
                  <div className="leaveDetailCell leaveDetailApproverName">{activeRequest.CurrentApprover || '-'}</div>
                  <div className="leaveDetailCell leaveDetailApproverStatus">
                    {activeRequest.Status === 'APPROVED' ? 'Approved' : 'Waiting'}
                  </div>
                  <div className="leaveDetailCell leaveDetailApproverName">
                    {approvedByList.length > 0 ? approvedByList[approvedByList.length - 1] : ''}
                  </div>
                  <div className="leaveDetailCell leaveDetailApproverStatus">
                    {approvedByList.length > 0 ? 'Approved' : ''}
                  </div>
                </div>
              </div>

              <div className="leaveDetailActions">
                <button type="button" className="leaveDetailRejectButton" onClick={handleRejectDetail}>
                  Reject
                </button>
                <button type="button" className="leaveDetailApproveButton" onClick={handleApproveDetail}>
                  Accept
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
