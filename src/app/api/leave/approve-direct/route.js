import { NextResponse } from 'next/server';
import { getLeaveRequestById, addLeaveApproval, updateLeaveRequestStatus } from '@/lib/leaveDb';
import { getEmployeeDetails } from '@/lib/payrollDb';
import { getUserEmail, sendMail, buildLeaveRequestEmailContent, getApprovalLink, getDirectApproveLink } from '@/lib/mail';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const leaveIdStr = searchParams.get('id');
    const approverId = searchParams.get('approver');

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
