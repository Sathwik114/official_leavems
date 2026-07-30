'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import './page.css';

function getHalfDayLeaveType(leaveType, startTime, endTime, startDate, endDate) {
  if (!startDate || startDate !== endDate) return '';

  const halfDayLeaveTypes = {
    EL: {
      '08:30 AM-01:30 PM': 'EL/P',
      '01:30 PM-06:00 PM': 'P/EL',
    },
    LWP: {
      '08:30 AM-01:30 PM': 'LWP/P',
      '01:30 PM-06:00 PM': 'P/LWP',
    },
  };

  return halfDayLeaveTypes[leaveType]?.[`${startTime}-${endTime}`] || '';
}

export default function ApplyLeaveForm({ employee, currentUserUsername, approvalFlow }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const empcode = searchParams.get('empcode') || '';

  const [leaveType, setLeaveType] = useState('EL');
  const [startDate, setStartDate] = useState('');
  const [startHour, setStartHour] = useState('08');
  const [startMin, setStartMin] = useState('30');
  const [startPeriod, setStartPeriod] = useState('AM');
  const [endDate, setEndDate] = useState('');
  const [endHour, setEndHour] = useState('05');
  const [endMin, setEndMin] = useState('00');
  const [endPeriod, setEndPeriod] = useState('PM');
  const [totalDays, setTotalDays] = useState('');
  const [reason, setReason] = useState('');
  const [relieverId, setRelieverId] = useState('');
  const [relieverName, setRelieverName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [attachment, setAttachment] = useState(null);
  const [relieverLookupStatus, setRelieverLookupStatus] = useState('');
  const [submitMessage, setSubmitMessage] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [approvalFlowDisplay, setApprovalFlowDisplay] = useState([]);
  const [alreadyApplied, setAlreadyApplied] = useState(false);

  const today = new Date().toLocaleDateString('en-GB');

  const totalDaysNum = parseFloat(totalDays) || 0;
  const fromTime = `${startHour}:${startMin} ${startPeriod}`;
  const toTime = `${endHour}:${endMin} ${endPeriod}`;
  const halfDayLeaveType = getHalfDayLeaveType(leaveType, fromTime, toTime, startDate, endDate);
  const leaveTypeForRequest = halfDayLeaveType || leaveType;
  const requiresAttachment = String(leaveTypeForRequest || '').toUpperCase() === 'SL' && totalDaysNum > 1;

  // Balances, formatted consistently as e.g. "0.00" / "1.50"
  const availableElBalance = Number(employee?.EarnLeaveBalance ?? 0);
  const availableSlBalance = Number(employee?.SickLeaveBalance ?? 0);

  const isElRelated = leaveTypeForRequest.toUpperCase().includes('EL');
  const isSlRelated = leaveTypeForRequest.toUpperCase().includes('SL');
  const exceedsElBalance = isElRelated && totalDaysNum > availableElBalance;
  const exceedsSlBalance = isSlRelated && totalDaysNum > availableSlBalance;
  const isVipLeaveRequest = approvalFlow?.role === 'vip';
  const balanceExceeded = !isVipLeaveRequest && (exceedsElBalance || exceedsSlBalance);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (startDate && endDate) {
      const halfDayLeaveType = getHalfDayLeaveType(
        leaveType,
        `${startHour}:${startMin} ${startPeriod}`,
        `${endHour}:${endMin} ${endPeriod}`,
        startDate,
        endDate
      );

      if (halfDayLeaveType) {
        setTotalDays('0.5');
        return;
      }

      const start = new Date(startDate);
      const end = new Date(endDate);
      const diffTime = end.getTime() - start.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
      setTotalDays(diffDays > 0 ? String(diffDays) : '0');
      } else {
        setTotalDays('');
      }
    }, 0);

    return () => clearTimeout(timer);
  }, [leaveType, startDate, endDate, startHour, startMin, startPeriod, endHour, endMin, endPeriod]);

  useEffect(() => {
    async function resolveFlowNames() {
      if (!approvalFlow?.flow?.length) {
        setApprovalFlowDisplay([]);
        return;
      }

      const resolved = await Promise.all(
        approvalFlow.flow.map(async (approverId) => {
          const trimmedId = String(approverId || '').trim();
          if (!trimmedId) return '';

          try {
            const res = await fetch(`/api/employee?empcode=${encodeURIComponent(trimmedId)}`);
            const data = await res.json();
            return data.employee?.EmpName
              ? `${data.employee.EmpName} (${trimmedId})`
              : trimmedId;
          } catch (err) {
            console.error('Approval flow lookup failed:', err);
            return trimmedId;
          }
        })
      );

      setApprovalFlowDisplay(resolved.filter(Boolean));
    }

    resolveFlowNames();
  }, [approvalFlow]);

  useEffect(() => {
    async function checkDuplicate() {
      const applicantId = employee?.EmpCode || empcode;
      if (!applicantId || !startDate) {
        setAlreadyApplied(false);
        return;
      }
      try {
        const res = await fetch(`/api/leave/check-duplicate?applicantId=${encodeURIComponent(applicantId)}&startDate=${encodeURIComponent(startDate)}`);
        const data = await res.json();
        if (data.exists) {
          setAlreadyApplied(true);
          setSubmitError('Already applied for the day');
        } else {
          setAlreadyApplied(false);
          setSubmitError(prev => prev === 'Already applied for the day' ? '' : prev);
        }
      } catch (err) {
        console.error('Error checking duplicate leave:', err);
      }
    }
    checkDuplicate();
  }, [startDate, employee, empcode]);

  async function handleRelieverIdBlur() {
    const trimmedId = relieverId.trim();
    if (!trimmedId) {
      setRelieverName('');
      setRelieverLookupStatus('');
      return;
    }

    setRelieverLookupStatus('loading');
    try {
      const res = await fetch(`/api/employee?empcode=${encodeURIComponent(trimmedId)}`);
      const data = await res.json();

      if (data.employee?.EmpName) {
        setRelieverName(data.employee.EmpName);
        setRelieverLookupStatus('');
      } else {
        setRelieverName('');
        setRelieverLookupStatus('error');
      }
    } catch (err) {
      console.error('Reliever lookup failed:', err);
      setRelieverName('');
      setRelieverLookupStatus('error');
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitMessage('');
    setSubmitError('');

    const applicantId = employee?.EmpCode || empcode;

    if (!applicantId || !startDate || !endDate || !reason.trim()) {
      setSubmitError('Please complete the required leave fields before submitting.');
      return;
    }

    if (!contactNumber.trim()) {
      setSubmitError('Please enter a contact number while on leave.');
      return;
    }

    if (!approvalFlow) {
      setSubmitError('This employee is not configured for the leave approval workflow.');
      return;
    }

    if (!isVipLeaveRequest && exceedsElBalance) {
      setSubmitError(`Insufficient EL balance. Available: ${availableElBalance.toFixed(2)}, Requested: ${totalDaysNum.toFixed(2)}.`);
      return;
    }

    if (!isVipLeaveRequest && exceedsSlBalance) {
      setSubmitError(`Insufficient SL balance. Available: ${availableSlBalance.toFixed(2)}, Requested: ${totalDaysNum.toFixed(2)}.`);
      return;
    }

    if (requiresAttachment && !attachment) {
      setSubmitError('Please upload a supporting document for sick leave requests longer than one day.');
      return;
    }

    if (alreadyApplied) {
      setSubmitError('Already applied for the day');
      return;
    }

    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.append('applicantId', applicantId);
      formData.append('applicantName', employee?.EmpName || '');
      formData.append('leaveType', leaveTypeForRequest);
      formData.append('startDate', startDate);
      formData.append('endDate', endDate);
      formData.append('fromTime', fromTime);
      formData.append('toTime', toTime);
      formData.append('totalDays', String(totalDaysNum));
      formData.append('reason', reason);
      formData.append('relieverId', relieverId);
      formData.append('relieverName', relieverName);
      formData.append('contactNumber', contactNumber);
      formData.append('currentUserUsername', currentUserUsername || '');

      if (attachment) {
        formData.append('attachment', attachment);
      }

      const res = await fetch('/api/leave', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Unable to submit leave application.');
      }

      setSubmitMessage(`Leave application submitted successfully. First approval is pending with ${data.currentApproverName || data.currentApprover || 'the configured approver'}.`);
      const nextPage = approvalFlow?.role === 'vip'
        ? '/dashboard/leave-approvals'
        : '/dashboard';
      setTimeout(() => router.push(nextPage), 1200);
    } catch (err) {
      console.error('Leave submission failed:', err);
      setSubmitError(err.message || 'Leave submission failed.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="leavePage">
      <div className="leaveTopBar">
        <button className="backButton" onClick={() => router.back()}>
          ← Back
        </button>
      </div>

      <div className="leaveCard">
        <div className="leaveCardHeader">
          <h1 className="leaveTitle">Leave Application</h1>
            <div className="leaveBalance">
            <span className="leaveBalanceLabel">Balance Leaves</span>
            <span className="leaveBalanceItem">
              EL <strong>{availableElBalance.toFixed(2)}</strong>
            </span>
            <span className="leaveBalanceDivider" />
            <span className="leaveBalanceItem">
              SL <strong>{availableSlBalance.toFixed(2)}</strong>
            </span>
          </div>
        </div>

        {submitMessage && (
          <div className="loginAlert loginAlertSuccess">
            <span>{submitMessage}</span>
          </div>
        )}
        {submitError && (
          <div className="loginAlert loginAlertError">
            <span>{submitError}</span>
          </div>
        )}

        {approvalFlow && (
          <div className="leaveSection">
            <h2 className="leaveSectionLabel">Approval Flow</h2>
            <p className="leaveInlineValue">
              {approvalFlowDisplay.length > 0
                ? approvalFlowDisplay.join(' → ')
                : approvalFlow.flow.join(' → ')}
            </p>
          </div>
        )}

        <form className="leaveForm" onSubmit={handleSubmit}>
          <div className="leaveFormRow leaveFormRowRight">
            <span className="leaveAppDate">
              Date of Application :{' '}
              <span className="leaveHighlight">{today}</span>
            </span>
          </div>

          {/* Personal Details section */}
          <div className="leaveSection">
            <h2 className="leaveSectionLabel">Personal Details</h2>

            <div className="leaveInlineInfoGrid">
              <div className="leaveInlineInfoItem">
                <span className="leaveInlineLabel">Employee ID :</span>
                <span className="leaveInlineValue leaveInlineValueHighlight">
                  {employee?.EmpCode || empcode}
                </span>
              </div>
              <div className="leaveInlineInfoItem">
                <span className="leaveInlineLabel">Employee Name :</span>
                <span className="leaveInlineValue">{employee?.EmpName || "-"}</span>
              </div>
            </div>

            <div className="leaveInlineInfoGrid">
              <div className="leaveInlineInfoItem">
                <span className="leaveInlineLabel">Department :</span>
                <span className="leaveInlineValue">{employee?.DeptCode || "-"}</span>
              </div>
              <div className="leaveInlineInfoItem">
                <span className="leaveInlineLabel">Section :</span>
                <span className="leaveInlineValue">{employee?.Section || "-"}</span>
              </div>
            </div>
          </div>

          {/* Leave Details section */}
          <div className="leaveSection">
            <h2 className="leaveSectionLabel">Leave Details</h2>

            <div className="leaveDateBlock">
              <div className="leaveDateHalf">
                <label className="leaveDateHeading">Start Date</label>
                <div className="leaveDateHalfInner">
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                  <div className="leaveTimeInline">
                    <select value={startHour} onChange={(e) => setStartHour(e.target.value)}>
                      {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                    <select value={startMin} onChange={(e) => setStartMin(e.target.value)}>
                      {['00', '30'].map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                    <select value={startPeriod} onChange={(e) => setStartPeriod(e.target.value)}>
                      <option value="AM">AM</option>
                      <option value="PM">PM</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="leaveDateDivider" />

              <div className="leaveDateHalf">
                <label className="leaveDateHeading">End Date</label>
                <div className="leaveDateHalfInner">
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                  <div className="leaveTimeInline">
                    <select value={endHour} onChange={(e) => setEndHour(e.target.value)}>
                      {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                    <select value={endMin} onChange={(e) => setEndMin(e.target.value)}>
                      {['00', '30'].map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                    <select value={endPeriod} onChange={(e) => setEndPeriod(e.target.value)}>
                      <option value="AM">AM</option>
                      <option value="PM">PM</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="leaveDateDivider" />

              <div className="leaveDateHalf leaveDateHalfTotal">
                <label className="leaveDateHeading">Total Days</label>
                <input type="text" value={totalDays} readOnly className="leaveReadOnly" />
              </div>
            </div>

            <div className="leaveFormRow leaveTypeReasonRow">
              <div className="leaveField leaveFieldTiny">
                <label>Leave Type</label>
                <select value={leaveType} onChange={(e) => setLeaveType(e.target.value)}>
                  <option value="EL">EL</option>
                  <option value="SL">SL</option>
                  <option value="LWP">LWP</option>
                  <option value="OD">OD</option>
                </select>
              </div>

              {halfDayLeaveType && (
                <div className="leaveField leaveFieldTiny">
                  <label>Leave Type Flow</label>
                  <input type="text" value={halfDayLeaveType} readOnly className="leaveReadOnly" />
                </div>
              )}

              <div className="leaveField leaveFieldGrow">
                <label>Reason</label>
                <input
                  type="text"
                  className="leaveInputFull"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
            </div>

            {(isElRelated || isSlRelated) && (
              <div className="leaveFormRow">
                <p className={balanceExceeded ? 'leaveFieldError' : 'leaveInlineValue'}>
                  {isElRelated
                    ? `EL balance available: ${availableElBalance.toFixed(2)} | Requested: ${totalDaysNum.toFixed(2)}`
                    : `SL balance available: ${availableSlBalance.toFixed(2)} | Requested: ${totalDaysNum.toFixed(2)}`}
                  {balanceExceeded && ' — insufficient balance'}
                </p>
              </div>
            )}

            {requiresAttachment && (
              <div className="leaveFormRow leaveAttachmentRow">
                <div className="leaveField">
                  <label>Upload Supporting Document</label>
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.bmp,.tif,.tiff,.svg"
                    onChange={(e) => setAttachment(e.target.files?.[0] || null)}
                  />
                </div>
                <p className="leaveAttachmentNote">
                  Please upload the supporting document for this sick leave request.
                </p>
              </div>
            )}
          </div>

          {/* Reliever section + Contact Number section — two separate boxed
              containers, side by side, with labels given equal height so
              the actual input fields line up at the same vertical level */}
          <div style={{ display: 'flex', gap: '16px', alignItems: 'stretch' }}>
            <div className="leaveSection" style={{ flex: '0 0 60%' }}>
              <h2 className="leaveSectionLabel">Reliever Details</h2>

              <div className="leaveFormRow leaveThreeCol">
                <div className="leaveField">
                  <label style={{ display: 'block', minHeight: '18px' }}>Reliever ID</label>
                  <input
                    type="text"
                    value={relieverId}
                    onChange={(e) => setRelieverId(e.target.value)}
                    onBlur={handleRelieverIdBlur}
                  />
                </div>
                <div className="leaveField leaveFieldGrow">
                  <label style={{ display: 'block', minHeight: '18px' }}>Reliever Name</label>
                  <input
                    type="text"
                    value={relieverName}
                    onChange={(e) => setRelieverName(e.target.value)}
                    placeholder={relieverLookupStatus === 'loading' ? 'Looking up...' : ''}
                    className={relieverLookupStatus === 'loading' ? 'leaveReadOnly' : ''}
                    readOnly={relieverLookupStatus === 'loading'}
                  />
                  {relieverLookupStatus === 'error' && (
                    <span className="leaveFieldError">Employee ID not found</span>
                  )}
                </div>
              </div>
            </div>

            <div className="leaveSection" style={{ flex: '0 0 40%' }}>
              <h2 className="leaveSectionLabel">Contact Number while on Leave</h2>

              <div className="leaveFormRow">
                <div className="leaveField" style={{ width: '100%' }}>
                  <label style={{ display: 'block', minHeight: '18px' }}>Contact Number</label>
                  <input
                    type="text"
                    value={contactNumber}
                    onChange={(e) => setContactNumber(e.target.value)}
                    required
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="leaveFormRow leaveFormSubmitRow">
            <button type="submit" className="leaveSubmitButton" disabled={isSubmitting || !approvalFlow || balanceExceeded || alreadyApplied}>
              {isSubmitting ? 'Submitting...' : 'Submit Application'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}