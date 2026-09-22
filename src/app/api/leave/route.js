import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import * as jose from 'jose';
import { createLeaveRequestWithInitialApproval, getPendingApprovalsForUser, getApprovedRequestsForApprover, getLeaveRequestsForApplicant, hasDuplicateLeaveRequest } from '@/lib/leaveDb';
import { getLeaveApprovalFlow } from '@/lib/leaveApprovalConfig';
import { getEmployeeDetails } from '@/lib/payrollDb';
import { getUserEmail, sendMail, buildLeaveRequestEmailContent, getApprovalLink, getDirectApproveLink, getDirectRejectLink } from '@/lib/mail';
import { saveLeaveDocument } from '@/lib/leaveDocumentStorage';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('auth_token')?.value;

    if (!token) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jose.jwtVerify(token, secret);
    const currentUserUsername = String(payload.username || payload.name || '').trim();

    const pendingApprovals = await getPendingApprovalsForUser(currentUserUsername);
    const approvedRequests = await getApprovedRequestsForApprover(currentUserUsername);
    const myRequests = await getLeaveRequestsForApplicant(currentUserUsername);

    return NextResponse.json({ pendingApprovals, approvedRequests, myRequests });
  } catch (error) {
    console.error('Leave list error:', error);
    return NextResponse.json({ error: 'Failed to load leave data.', details: error.message }, { status: 500 });
  }

}

export async function POST(request) {
  try {
    const contentType = request.headers.get('content-type') || '';
    let body = {};
    let attachmentFile = null;

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      body = Object.fromEntries(formData.entries());
      const attachmentEntry = formData.get('attachment');
      if (attachmentEntry instanceof File && attachmentEntry.size > 0) {
        attachmentFile = attachmentEntry;
      }
    } else {
      body = await request.json();
    }

    const {
      applicantId,
      applicantName,
      leaveType,
      startDate,
      endDate,
      fromTime,
      toTime,
      totalDays,
      reason,
      relieverId,
      relieverName,
      contactNumber,
      currentUserUsername,
    } = body;

    if (!applicantId || !startDate || !endDate || !reason) {
      return NextResponse.json(
        { error: 'Applicant id, dates, and reason are required.' },
        { status: 400 }
      );
    }

    const isDuplicate = await hasDuplicateLeaveRequest(applicantId, startDate);
    if (isDuplicate) {
      return NextResponse.json(
        { error: 'Already applied for the day' },
        { status: 400 }
      );
    }

    const normalizedLeaveType = String(leaveType || '').trim();
    const requiresAttachment = normalizedLeaveType.toUpperCase() === 'SL' && Number(totalDays || 0) > 1;

    if (requiresAttachment && !attachmentFile) {
      return NextResponse.json(
        { error: 'A supporting document is required for sick leave requests longer than one day.' },
        { status: 400 }
      );
    }

    const approvalFlow = await getLeaveApprovalFlow(applicantId, currentUserUsername);
    if (!approvalFlow) {
      return NextResponse.json(
        { error: 'No approval flow configured for this applicant.' },
        { status: 400 }
      );
    }

    const flowNames = await Promise.all(
      (approvalFlow.flow || []).map(async (approverId) => {
        const trimmedId = String(approverId || '').trim();
        if (!trimmedId) return '';

        try {
          const employee = await getEmployeeDetails(trimmedId);
          return employee?.EmpName || trimmedId;
        } catch (error) {
          return trimmedId;
        }
      })
    );

    const applicantEmployee = await getEmployeeDetails(applicantId);
    const currentApproverName = (approvalFlow.initialApprover ? await getEmployeeDetails(String(approvalFlow.initialApprover).trim()).catch(() => null) : null)?.EmpName || approvalFlow.initialApprover;
    const nextApproverName = approvalFlow.flow[1]
      ? (await getEmployeeDetails(String(approvalFlow.flow[1]).trim()).catch(() => null))?.EmpName || approvalFlow.flow[1]
      : '';

    const savedLeaveRequest = await createLeaveRequestWithInitialApproval({
      applicantId: String(applicantId),
      applicantName: applicantName || applicantEmployee?.EmpName || '',
      department: applicantEmployee?.DeptCode || '',
      section: applicantEmployee?.Section || '',
      shift: applicantEmployee?.Shift || '',
      empType: applicantEmployee?.EmpType || '',
      leaveType: normalizedLeaveType || 'EL',
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      fromTime: String(fromTime || '').trim() || null,
      toTime: String(toTime || '').trim() || null,
      totalDays: Number(totalDays) || 1,
      reason: String(reason),
      relieverId: relieverId || null,
      relieverName: relieverName || null,
      contactNumber: contactNumber || null,
      attachmentName: attachmentFile?.name || null,
      attachmentType: attachmentFile?.type || null,
      approvalFlow: approvalFlow.flow.join(','),
      currentApprover: approvalFlow.initialApprover,
    }, approvalFlow.initialApprover);

    console.debug('Leave submission: savedLeaveRequest', {
      id: savedLeaveRequest?.Id,
      tranId: savedLeaveRequest?.TranId,
      attachmentNameFromPayload: attachmentFile?.name || null,
      attachmentTypeFromPayload: attachmentFile?.type || null,
      savedAttachmentName: savedLeaveRequest?.AttachmentName || null,
    });

    const leaveId = savedLeaveRequest?.Id || savedLeaveRequest?.id || null;
    const tranId = String(savedLeaveRequest?.TranId || '').trim();

    if (!leaveId) {
      return NextResponse.json({ error: 'Failed to determine saved leave request id.' }, { status: 500 });
    }

    if (requiresAttachment && attachmentFile) {
      console.debug('Leave submission: saving attachment to OnlineLeavePDF', { tranId, name: attachmentFile.name, type: attachmentFile.type, size: attachmentFile.size });
      await saveLeaveDocument(tranId, attachmentFile, attachmentFile.name, attachmentFile.type);
      console.debug('Leave submission: saveLeaveDocument completed for', { tranId });
    }

    const firstApproverEmail = getUserEmail(approvalFlow.initialApprover);
    const emailRequest = {
      applicantId: String(applicantId),
      applicantName: applicantName || applicantEmployee?.EmpName || '',
      department: applicantEmployee?.DeptCode || '',
      section: applicantEmployee?.Section || '',
      leaveType: leaveType || 'EL',
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      totalDays: Number(totalDays) || 1,
      reason: String(reason),
      relieverId: relieverId || '',
      relieverName: relieverName || '',
      contactNumber: contactNumber || '',
      approvalFlow: approvalFlow.flow,
      EarnLeaveBalance: applicantEmployee?.EarnLeaveBalance ?? 0,
      SickLeaveBalance: applicantEmployee?.SickLeaveBalance ?? 0,
      fromTime: savedLeaveRequest.FromTime || '',
      toTime: savedLeaveRequest.ToTime || '',
      shift: savedLeaveRequest.Shift || '',
      empType: savedLeaveRequest.EmpType || '',
      createdAt: savedLeaveRequest.CreatedAt || new Date(),
      TranId: savedLeaveRequest.TranId || '',
      AttachmentName: savedLeaveRequest.AttachmentName || '',
      HodApproval: savedLeaveRequest.HodApproval || '',
      HodStatus: savedLeaveRequest.HodStatus || 'PENDING',
      CccApproval: savedLeaveRequest.CccApproval || '',
      CccStatus: savedLeaveRequest.CccStatus || 'PENDING',
    };

    const { html, text } = buildLeaveRequestEmailContent(emailRequest, {
      action: 'Submitted',
      currentApproverName,
      nextApproverName,
      status: 'PENDING',
      senderName: 'HR Department',
      approvalLink: getApprovalLink(leaveId, approvalFlow.initialApprover),
      directApproveLink: getDirectApproveLink(leaveId, approvalFlow.initialApprover),
      directRejectLink: getDirectRejectLink(leaveId, approvalFlow.initialApprover),
    });

    try {
      await sendMail({
        to: firstApproverEmail,
        subject: `Leave Request Pending Approval: ${emailRequest.applicantName}`,
        html,
        text,
      });
    } catch (mailError) {
      console.error('Failed to send leave submission notification:', mailError);
    }

    return NextResponse.json({
      success: true,
      leaveRequestId: leaveId,
      currentApprover: approvalFlow.initialApprover,
      currentApproverName,
      flow: approvalFlow.flow,
      flowNames,
      savedLeaveRequest,
    });
  } catch (error) {
    console.error('Leave submission error:', error);
    return NextResponse.json(
      { error: 'Failed to save leave request.', details: error.message },
      { status: 500 }
    );
  }

}
