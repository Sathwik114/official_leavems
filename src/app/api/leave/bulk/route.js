import { NextResponse } from 'next/server';
import { getLeaveRequestById, addLeaveApproval, updateLeaveRequestStatus, updateLeaveRequestRejection } from '@/lib/leaveDb';
import { getEmployeeDetails } from '@/lib/payrollDb';
import { getUserEmail, sendMail, buildLeaveRequestEmailContent, getApprovalLink, getDirectApproveLink } from '@/lib/mail';

export async function POST(request) {
  try {
    const body = await request.json();
    const { ids, approverId, decision, remarks } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids array is required' }, { status: 400 });
    }

    const results = [];

    for (const id of ids) {
      const leaveRequest = await getLeaveRequestById(Number(id));
      if (!leaveRequest) {
        results.push({ id, success: false, error: 'not found' });
        continue;
      }

      const flow = String(leaveRequest.ApprovalFlow || '').split(',').filter(Boolean);
      const requestCurrentApproverId = String(leaveRequest.CurrentApproverId || '').trim();
      const currentStep = flow.indexOf(requestCurrentApproverId);
      const nextApprover = flow[currentStep + 1] || null;

      const decisionValue = String(decision || 'APPROVED').toUpperCase();

      await addLeaveApproval(Number(id), approverId, decisionValue, remarks || '', currentStep + 1);

      if (decisionValue === 'APPROVED') {
        await updateLeaveRequestStatus(Number(id), nextApprover || '', nextApprover ? 'PENDING' : 'APPROVED', approverId);
        results.push({ id, success: true, nextApprover });

        const approverName = (await getEmployeeDetails(approverId).catch(() => null))?.EmpName || approverId;
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
            approvalLink: getApprovalLink(id, nextApprover),
            directApproveLink: getDirectApproveLink(id, nextApprover),
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

        if (emailContent && recipientEmail) {
          try {
            await sendMail({
              to: recipientEmail,
              subject: emailSubject,
              html: emailContent.html,
              text: emailContent.text,
            });
          } catch (mailError) {
            console.error('Failed to send mail in bulk approval:', mailError);
          }
        }
      } else {
        await updateLeaveRequestRejection(Number(id), approverId, remarks || '');
        results.push({ id, success: true, rejected: true });

        const approverName = (await getEmployeeDetails(approverId).catch(() => null))?.EmpName || approverId;
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

        const recipientEmail = getUserEmail(leaveRequest.ApplicantId);
        const emailSubject = `Leave Request Rejected: ${emailRequest.applicantName}`;
        const emailContent = buildLeaveRequestEmailContent(emailRequest, {
          action: 'Rejected',
          currentApproverName: approverName,
          nextApproverName: '',
          status: 'REJECTED',
          remarks: remarks || '',
          senderName: approverName,
        });

        if (emailContent && recipientEmail) {
          try {
            await sendMail({
              to: recipientEmail,
              subject: emailSubject,
              html: emailContent.html,
              text: emailContent.text,
            });
          } catch (mailError) {
            console.error('Failed to send mail in bulk rejection:', mailError);
          }
        }
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (err) {
    console.error('Bulk approval error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
