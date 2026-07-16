'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import './page.css';

export default function ApplyLeaveForm({ employee }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const empcode = searchParams.get('empcode') || '';

  const [leaveType, setLeaveType] = useState('Earned Leave');
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
  const [relieverLookupStatus, setRelieverLookupStatus] = useState(''); // '', 'loading', 'error'

  const today = new Date().toLocaleDateString('en-GB');

  const totalDaysNum = parseInt(totalDays, 10) || 0;
  const isSickLeaveOverThree = leaveType === 'Sick Leave' && totalDaysNum > 3;
  const isEsiOrMl = leaveType === 'ESI' || leaveType === 'ML';
  const requiresAttachment = isSickLeaveOverThree || isEsiOrMl;

  useEffect(() => {
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const diffTime = end.getTime() - start.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
      setTotalDays(diffDays > 0 ? String(diffDays) : '0');
    } else {
      setTotalDays('');
    }
  }, [startDate, endDate]);

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

  function handleSubmit(e) {
    e.preventDefault();
    console.log({
      empcode,
      leaveType,
      startDate,
      startTime: `${startHour}:${startMin} ${startPeriod}`,
      endDate,
      endTime: `${endHour}:${endMin} ${endPeriod}`,
      totalDays,
      reason,
      relieverId,
      relieverName,
      contactNumber,
      attachment,
    });
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
              Earn Leave <strong>0</strong>
            </span>
            <span className="leaveBalanceDivider" />
            <span className="leaveBalanceItem">
              Sick Leave <strong>0</strong>
            </span>
          </div>
        </div>

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
                      {['00', '15', '30', '45'].map((m) => (
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
                      {['00', '15', '30', '45'].map((m) => (
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
                  <option value="Earned Leave">Earned Leave</option>
                  <option value="Sick Leave">Sick Leave</option>
                  <option value="LWP">LWP</option>
                  <option value="ESI">ESI</option>
                  <option value="ML">ML</option>
                </select>
              </div>

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

            {requiresAttachment && (
              <div className="leaveFormRow leaveAttachmentRow">
                <div className="leaveField">
                  <label>Upload Supporting Document</label>
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => setAttachment(e.target.files?.[0] || null)}
                  />
                </div>
                <p className="leaveAttachmentNote">
                  {isEsiOrMl
                    ? 'Please upload the verified doctor\u2019s document.'
                    : 'Please upload the file copy of doctor\u2019s sheet.'}
                </p>
              </div>
            )}
          </div>

          {/* Reliever section */}
          <div className="leaveSection">
            <h2 className="leaveSectionLabel">Reliever Details</h2>

            <div className="leaveFormRow leaveThreeCol">
              <div className="leaveField">
                <label>Reliever ID</label>
                <input
                  type="text"
                  value={relieverId}
                  onChange={(e) => setRelieverId(e.target.value)}
                  onBlur={handleRelieverIdBlur}
                />
              </div>
              <div className="leaveField">
                <label>Reliever Name</label>
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
              <div className="leaveField">
                <label>Contact Number while on Leave</label>
                <input type="text" value={contactNumber} onChange={(e) => setContactNumber(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="leaveFormRow leaveFormSubmitRow">
            <button type="submit" className="leaveSubmitButton">
              Submit Application
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}