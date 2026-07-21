import { NextResponse } from 'next/server';
import { addLeaveApproval, getLeaveRequestById, updateLeaveRequestStatus } from '@/lib/leaveDb';
import { getEmployeeDetails } from '@/lib/payrollDb';
import { getUserEmail, sendMail, buildLeaveRequestEmailContent, getApprovalLink, getDirectApproveLink } from '@/lib/mail';

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const leaveRequestId = Number(id);

    let body = {};
    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      body = await request.json();
    } else {
      const formData = await request.formData();
      body = Object.fromEntries(formData.entries());
    }

    const { approverId, decision, remarks, approvalFlow } = body;
    const leaveRequest = await getLeaveRequestById(leaveRequestId);

    if (!leaveRequest) {
      return NextResponse.json({ error: 'Leave request not found.' }, { status: 404 });
    }

    const requestCurrentApproverId = String(leaveRequest.CurrentApproverId || '').trim();
    const flow = String(approvalFlow || leaveRequest.ApprovalFlow || '').split(',').filter(Boolean);
    const currentStep = flow.indexOf(requestCurrentApproverId);
    const nextApprover = flow[currentStep + 1] || null;

    if (!requestCurrentApproverId) {
      return NextResponse.json({ error: 'No active approver is assigned to this request.' }, { status: 400 });
    }

    const approvedBy = String(approverId || requestCurrentApproverId || '').trim();
    const decisionValue = String(decision || 'APPROVED').toUpperCase();

    await addLeaveApproval(leaveRequestId, approvedBy, decisionValue, remarks || '', currentStep + 1);
    await updateLeaveRequestStatus(
      leaveRequestId,
      nextApprover || '',
      nextApprover ? 'PENDING' : 'APPROVED',
      decisionValue === 'APPROVED' ? approvedBy : null
    );

    const approverName = (await getEmployeeDetails(approvedBy).catch(() => null))?.EmpName || approvedBy;
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

    if (decisionValue === 'APPROVED') {
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
          remarks: remarks || '',
          senderName: approverName,
        });
      }
    } else if (decisionValue === 'REJECTED') {
      recipientEmail = getUserEmail(leaveRequest.ApplicantId);
      emailSubject = `Leave Request Rejected: ${emailRequest.applicantName}`;
      emailContent = buildLeaveRequestEmailContent(emailRequest, {
        action: 'Rejected',
        currentApproverName: approverName,
        nextApproverName: '',
        status: 'REJECTED',
        remarks: remarks || '',
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
        console.error('Failed to send leave decision notification email:', mailError);
      }
    }

    return NextResponse.json({
      success: true,
      nextApprover,
      status: nextApprover ? 'PENDING' : 'APPROVED',
    });
  } catch (error) {
    console.error('Approval update error:', error);
    return NextResponse.json(
      { error: 'Failed to update approval state.' },
      { status: 500 }
    );
  }
}
