import { NextResponse } from 'next/server';
import { getLeaveRequestById, addLeaveApproval, updateLeaveRequestStatus, updateLeaveRequestRejection } from '@/lib/leaveDb';
import { getEmployeeDetails } from '@/lib/payrollDb';
import { getUserEmail, sendMail, buildLeaveRequestEmailContent, getApprovalLink, getDirectApproveLink, getDirectRejectLink } from '@/lib/mail';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const leaveIdStr = searchParams.get('id');
    const approverId = searchParams.get('approver');
    const action = searchParams.get('action') || 'approve';

    if (!leaveIdStr || !approverId) {
      return serveHtmlResponse(
        'Missing Parameters',
        'Required query parameters "id" and "approver" are missing.',
        false
      );
    }

    const leaveRequestId = Number(leaveIdStr);
    const leaveRequest = await getLeaveRequestById(leaveRequestId);

    if (!leaveRequest) {
      return serveHtmlResponse(
        'Request Not Found',
        `Leave request #${leaveRequestId} could not be found in the database.`,
        false
      );
    }

    const currentApproverId = String(leaveRequest.CurrentApproverId || '').trim();
    const targetApproverId = String(approverId).trim();

    // Check if this approver is part of the flow
    const flow = String(leaveRequest.ApprovalFlow || '').split(',').filter(Boolean);
    const currentStep = flow.indexOf(currentApproverId);
    const approverIndexInFlow = flow.indexOf(targetApproverId);

    if (approverIndexInFlow === -1) {
      return serveHtmlResponse(
        'Access Denied',
        `Employee ID "${targetApproverId}" is not configured in the approval flow for this leave request.`,
        false
      );
    }

    if (leaveRequest.Status === 'APPROVED') {
      return serveHtmlResponse(
        'Already Approved',
        `This leave request has already been fully approved.`,
        true
      );
    }

    if (leaveRequest.Status === 'REJECTED') {
      return serveHtmlResponse(
        'Already Rejected',
        `This leave request has already been rejected.`,
        false
      );
    }

    // If current step does not match, check if they already actioned it or if it's too early
    if (currentApproverId !== targetApproverId) {
      if (approverIndexInFlow < currentStep || currentStep === -1) {
        return serveHtmlResponse(
          'Already Actioned',
          `You have already approved this request. It is currently with the next steps or has been processed.`,
          true
        );
      } else {
        return serveHtmlResponse(
          'Pending Previous Approval',
          `This request is waiting for a previous approver in the flow before you can take action.`,
          false
        );
      }
    }

    if (action === 'reject') {
      return serveRejectPrompt(leaveRequestId, targetApproverId);
    }

    // Proceed to approve
    const nextApprover = flow[currentStep + 1] || null;
    const decisionValue = 'APPROVED';

    await addLeaveApproval(leaveRequestId, targetApproverId, decisionValue, 'Approved directly via Email link', currentStep + 1);
    await updateLeaveRequestStatus(
      leaveRequestId,
      nextApprover || '',
      nextApprover ? 'PENDING' : 'APPROVED',
      targetApproverId
    );

    // Fetch display names and details for email
    const approverName = (await getEmployeeDetails(targetApproverId).catch(() => null))?.EmpName || targetApproverId;
    const nextApproverName = nextApprover
      ? (await getEmployeeDetails(nextApprover).catch(() => null))?.EmpName || nextApprover
      : '';
    const applicantEmployee = await getEmployeeDetails(leaveRequest.ApplicantId);

    const emailRequest = {
      applicantId: leaveRequest.ApplicantId,
      applicantName: leaveRequest.ApplicantName || applicantEmployee?.EmpName || '',
      department: applicantEmployee?.DeptCode || '',
      section: applicantEmployee?.Section || '',
      leaveType: leaveRequest.LeaveType,
      startDate: leaveRequest.StartDate,
      endDate: leaveRequest.EndDate,
      totalDays: leaveRequest.TotalDays,
      reason: leaveRequest.Reason,
      relieverId: leaveRequest.RelieverId || '',
      relieverName: leaveRequest.RelieverName || '',
      contactNumber: leaveRequest.ContactNumber || '',
      approvalFlow: flow,
    };

    let emailSubject = '';
    let emailContent = null;
    let recipientEmail = '';

    if (nextApprover) {
      recipientEmail = getUserEmail(nextApprover);
      emailSubject = `Leave Request Approved by ${approverName} - Next Approval Required`;
      emailContent = buildLeaveRequestEmailContent(emailRequest, {
        action: 'Approved',
        currentApproverName: approverName,
        nextApproverName,
        status: 'PENDING',
        senderName: approverName,
        approvalLink: getApprovalLink(leaveRequestId, nextApprover),
        directApproveLink: getDirectApproveLink(leaveRequestId, nextApprover),
        directRejectLink: getDirectRejectLink(leaveRequestId, nextApprover),
      });
    } else {
      recipientEmail = getUserEmail(leaveRequest.ApplicantId);
      emailSubject = `Leave Request Approved: ${emailRequest.applicantName}`;
      emailContent = buildLeaveRequestEmailContent(emailRequest, {
        action: 'Approved',
        currentApproverName: approverName,
        nextApproverName: '',
        status: 'APPROVED',
        remarks: 'Approved directly via Email link',
        senderName: approverName,
      });
    }

    if (emailContent && recipientEmail) {
      try {
        await sendMail({
          to: recipientEmail,
          subject: emailSubject,
          html: emailContent.html,
          text: emailContent.text,
        });
      } catch (mailError) {
        console.error('Failed to send next approval notification in direct approve route:', mailError);
      }
    }

    return serveHtmlResponse(
      'Approval Successful',
      `Leave request #${leaveRequestId} submitted by ${emailRequest.applicantName} has been successfully approved.`,
      true
    );
  } catch (error) {
    console.error('Direct approval error:', error);
    return serveHtmlResponse(
      'System Error',
      `An unexpected system error occurred: ${error.message}`,
      false
    );
  }
}

export async function POST(request) {
  try {
    const { searchParams } = new URL(request.url);
    const leaveRequestId = Number(searchParams.get('id'));
    const targetApproverId = String(searchParams.get('approver') || '').trim();
    const { reason } = await request.json();
    const rejectionReason = String(reason || '').trim();

    if (!leaveRequestId || !targetApproverId || !rejectionReason) {
      return NextResponse.json({ error: 'A rejection reason is required.' }, { status: 400 });
    }

    const leaveRequest = await getLeaveRequestById(leaveRequestId);
    if (!leaveRequest) {
      return NextResponse.json({ error: 'Leave request not found.' }, { status: 404 });
    }

    const currentApproverId = String(leaveRequest.CurrentApproverId || '').trim();
    if (leaveRequest.Status !== 'PENDING' || currentApproverId !== targetApproverId) {
      return NextResponse.json({ error: 'This request can no longer be rejected from this link.' }, { status: 409 });
    }

    const flow = String(leaveRequest.ApprovalFlow || '').split(',').filter(Boolean);
    const currentStep = flow.indexOf(currentApproverId);
    if (currentStep === -1) {
      return NextResponse.json({ error: 'Approver is not configured for this request.' }, { status: 403 });
    }

    await addLeaveApproval(leaveRequestId, targetApproverId, 'REJECTED', rejectionReason, currentStep + 1);
    await updateLeaveRequestRejection(leaveRequestId, targetApproverId, rejectionReason);

    const approverName = (await getEmployeeDetails(targetApproverId).catch(() => null))?.EmpName || targetApproverId;
    const applicantEmployee = await getEmployeeDetails(leaveRequest.ApplicantId);
    const emailRequest = {
      applicantId: leaveRequest.ApplicantId,
      applicantName: leaveRequest.ApplicantName || applicantEmployee?.EmpName || '',
      department: leaveRequest.Department || applicantEmployee?.DeptCode || '',
      section: leaveRequest.Section || applicantEmployee?.Section || '',
      leaveType: leaveRequest.LeaveType,
      startDate: leaveRequest.StartDate,
      endDate: leaveRequest.EndDate,
      totalDays: leaveRequest.TotalDays,
      reason: leaveRequest.Reason,
      relieverId: leaveRequest.RelieverId || '',
      relieverName: leaveRequest.RelieverName || '',
      contactNumber: leaveRequest.ContactNumber || '',
      approvalFlow: flow,
    };

    try {
      const content = buildLeaveRequestEmailContent(emailRequest, {
        action: 'Rejected',
        currentApproverName: approverName,
        status: 'REJECTED',
        remarks: rejectionReason,
        senderName: approverName,
      });
      await sendMail({
        to: getUserEmail(leaveRequest.ApplicantId),
        subject: `Leave Request Rejected: ${emailRequest.applicantName}`,
        html: content.html,
        text: content.text,
      });
    } catch (mailError) {
      console.error('Failed to send rejection notification:', mailError);
    }

    return NextResponse.json({ success: true, applicantName: emailRequest.applicantName });
  } catch (error) {
    console.error('Direct rejection error:', error);
    return NextResponse.json({ error: 'Unable to reject the leave request.' }, { status: 500 });
  }
}

function serveRejectPrompt(leaveRequestId, approverId) {
  const actionUrl = `/api/leave/approve-direct?id=${encodeURIComponent(leaveRequestId)}&approver=${encodeURIComponent(approverId)}&action=reject`;
  const html = `<!doctype html>
    <html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Reject Leave Request</title></head>
    <body style="font-family:Arial,sans-serif;background:#f8fafc;display:grid;place-items:center;min-height:100vh;margin:0;color:#0f172a;">
      <main style="background:#fff;padding:32px;border-radius:12px;max-width:440px;text-align:center;box-shadow:0 10px 25px rgba(0,0,0,.1);">
        <h1 style="margin-top:0;">Reject leave request?</h1>
        <p id="message">You will be asked for a rejection reason.</p>
        <button id="reject" style="border:0;border-radius:6px;background:#dc2626;color:#fff;padding:12px 24px;font-weight:700;cursor:pointer;">Reject Request</button>
      </main>
      <script>
        document.getElementById('reject').addEventListener('click', async () => {
          const reason = window.prompt('Please enter the rejection reason:');
          if (!reason || !reason.trim()) return;
          const button = document.getElementById('reject');
          button.disabled = true;
          document.getElementById('message').textContent = 'Saving rejection…';
          const response = await fetch('${actionUrl}', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) });
          const data = await response.json();
          document.getElementById('message').textContent = response.ok ? 'Leave request rejected. The approval flow has stopped.' : (data.error || 'Unable to reject the request.');
          button.style.display = 'none';
        });
      </script>
    </body></html>`;
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } });
}

function serveHtmlResponse(title, message, isSuccess) {
  const primaryColor = isSuccess ? '#0284c7' : '#ef4444';
  const icon = isSuccess 
    ? `<svg style="width: 48px; height: 48px; color: #10b981;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`
    : `<svg style="width: 48px; height: 48px; color: #ef4444;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>`;

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title} - Leave Management System</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          background-color: #f1f5f9;
          margin: 0;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
        }
        .container {
          background-color: #ffffff;
          border-radius: 12px;
          border: 1px solid #cbd5e1;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1);
          width: 100%;
          max-width: 480px;
          padding: 32px;
          text-align: center;
          box-sizing: border-box;
          margin: 16px;
        }
        .icon-wrapper {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 80px;
          height: 80px;
          border-radius: 50%;
          background-color: ${isSuccess ? '#ecfdf5' : '#fef2f2'};
          margin-bottom: 24px;
        }
        h1 {
          font-size: 24px;
          font-weight: 700;
          color: #0f172a;
          margin: 0 0 12px 0;
        }
        p {
          font-size: 15px;
          color: #475569;
          line-height: 1.6;
          margin: 0 0 28px 0;
        }
        .btn {
          display: inline-block;
          background-color: ${primaryColor};
          color: #ffffff;
          font-weight: bold;
          text-decoration: none;
          padding: 12px 24px;
          border-radius: 6px;
          font-size: 14px;
          transition: opacity 0.15s ease;
        }
        .btn:hover {
          opacity: 0.9;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="icon-wrapper">
          ${icon}
        </div>
        <h1>${title}</h1>
        <p>${message}</p>
        <a href="/dashboard" class="btn">Go to Dashboard</a>
      </div>
    </body>
    </html>
  `;

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html' },
  });
}
