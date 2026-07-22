import nodemailer from 'nodemailer';

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_SECURE = String(process.env.SMTP_SECURE || 'true').toLowerCase() === 'true';
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_AUTH_METHOD = process.env.SMTP_AUTH_METHOD?.trim();
const MAIL_FROM = process.env.MAIL_FROM || SMTP_USER;
const APP_URL = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://10.40.20.4:3000';

if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !MAIL_FROM) {
  console.warn('SMTP configuration is incomplete. Email sending may fail.');
}

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_SECURE,
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
  ...(SMTP_AUTH_METHOD ? { authMethod: SMTP_AUTH_METHOD } : {}),
  tls: {
    rejectUnauthorized: false,
  },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
});

function normalizeUserId(userId) {
  return String(userId || '').trim();
}

export function getUserEmail(userId) {
  const normalized = normalizeUserId(userId);
  return normalized ? `${normalized}@gti.nws.cn` : '';
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatSectionRow(label, value) {
  return `
    <tr>
      <td style="padding: 8px; border: 1px solid #ddd;"><strong>${label}</strong></td>
      <td style="padding: 8px; border: 1px solid #ddd;">${value || '-'}</td>
    </tr>
  `;
}

export function buildLeaveRequestEmailContent(request, options = {}) {
  const {
    action = 'Submitted',
    currentApproverName = '',
    nextApproverName = '',
    status = 'PENDING',
    remarks = '',
    senderName = 'HR Department',
    approvalLink = '',
    directApproveLink = '',
    directRejectLink = '',
  } = options;

  const approvalFlow = Array.isArray(request.approvalFlow)
    ? request.approvalFlow.join(' → ')
    : String(request.approvalFlow || '');

  const html = `
    <div style="font-family: system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; padding: 24px; color: #1e293b;">
      <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #cbd5e1; overflow: hidden; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05);">
        <!-- Header banner -->
        <div style="background: linear-gradient(135deg, #0284c7, #0f172a); padding: 24px; text-align: center; color: #ffffff;">
          <h2 style="margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.025em;">Leave Request Details</h2>
          <p style="margin: 4px 0 0 0; font-size: 14px; opacity: 0.9; font-weight: 500;">Status: ${status} (${action})</p>
        </div>

        <!-- Info message -->
        <div style="padding: 20px 24px 0 24px;">
          <p style="margin: 0; font-size: 14px; color: #475569; line-height: 1.5;">
            A leave request has been <strong>${action.toLowerCase()}</strong>. Please find the details of the leave application form below.
          </p>
        </div>

        <!-- Table Form (View Form representation) -->
        <div style="padding: 20px 24px;">
          <table style="width: 100%; border-collapse: collapse; font-size: 13px; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden;">
            <!-- Header row -->
            <tr style="background-color: #f8fafc; border-bottom: 1px solid #cbd5e1;">
              <td colspan="2" style="padding: 10px 12px; font-weight: 600; color: #334155;">
                Balance Leaves: EL: <strong>${request.EarnLeaveBalance ?? 0}</strong> | SL: <strong>${request.SickLeaveBalance ?? 0}</strong>
              </td>
              <td colspan="2" style="padding: 10px 12px; font-weight: 600; color: #334155; text-align: right;">
                Date of Application: <span style="color: #dc2626; font-weight: bold;">${formatDate(request.createdAt || new Date())}</span>
              </td>
            </tr>
            <!-- Row 1: Employee details -->
            <tr style="border-bottom: 1px solid #cbd5e1;">
              <td style="padding: 10px 12px; font-weight: 600; color: #475569; background-color: #fafbfc; border-right: 1px solid #cbd5e1; width: 25%;">Employee Name:</td>
              <td style="padding: 10px 12px; font-weight: 700; color: #0f172a; border-right: 1px solid #cbd5e1; width: 25%;">${request.applicantName || '-'}</td>
              <td style="padding: 10px 12px; font-weight: 600; color: #475569; background-color: #fafbfc; border-right: 1px solid #cbd5e1; width: 25%;">Employee ID:</td>
              <td style="padding: 10px 12px; font-weight: 700; color: #0f172a; width: 25%;">${request.applicantId || '-'}</td>
            </tr>
            <!-- Row 2: Department and Section -->
            <tr style="border-bottom: 1px solid #cbd5e1;">
              <td style="padding: 10px 12px; font-weight: 600; color: #475569; background-color: #fafbfc; border-right: 1px solid #cbd5e1;">Department:</td>
              <td style="padding: 10px 12px; font-weight: 700; color: #0f172a; border-right: 1px solid #cbd5e1;">${request.department || '-'}</td>
              <td style="padding: 10px 12px; font-weight: 600; color: #475569; background-color: #fafbfc; border-right: 1px solid #cbd5e1;">Section:</td>
              <td style="padding: 10px 12px; font-weight: 700; color: #0f172a;">${request.section || '-'}</td>
            </tr>
            <!-- Row 3: Leave Type and Days -->
            <tr style="border-bottom: 1px solid #cbd5e1;">
              <td style="padding: 10px 12px; font-weight: 600; color: #475569; background-color: #fafbfc; border-right: 1px solid #cbd5e1;">Leave Type:</td>
              <td style="padding: 10px 12px; font-weight: 700; color: #0f172a; border-right: 1px solid #cbd5e1;">${request.leaveType || '-'}</td>
              <td style="padding: 10px 12px; font-weight: 600; color: #475569; background-color: #fafbfc; border-right: 1px solid #cbd5e1;">No of Days:</td>
              <td style="padding: 10px 12px; font-weight: 700; color: #0f172a;">${request.totalDays || '-'}</td>
            </tr>
            <!-- Row 4: Start Date and End Date -->
            <tr style="border-bottom: 1px solid #cbd5e1;">
              <td style="padding: 10px 12px; font-weight: 600; color: #475569; background-color: #fafbfc; border-right: 1px solid #cbd5e1;">Leave Start Date:</td>
              <td style="padding: 10px 12px; font-weight: 700; color: #0f172a; border-right: 1px solid #cbd5e1;">${formatDate(request.startDate)}</td>
              <td style="padding: 10px 12px; font-weight: 600; color: #475569; background-color: #fafbfc; border-right: 1px solid #cbd5e1;">End Date:</td>
              <td style="padding: 10px 12px; font-weight: 700; color: #0f172a;">${formatDate(request.endDate)}</td>
            </tr>
            <!-- Row 5: Contact and Reliever -->
            <tr style="border-bottom: 1px solid #cbd5e1;">
              <td style="padding: 10px 12px; font-weight: 600; color: #475569; background-color: #fafbfc; border-right: 1px solid #cbd5e1;">Contact Number:</td>
              <td style="padding: 10px 12px; font-weight: 700; color: #0f172a; border-right: 1px solid #cbd5e1;">${request.contactNumber || '-'}</td>
              <td style="padding: 10px 12px; font-weight: 600; color: #475569; background-color: #fafbfc; border-right: 1px solid #cbd5e1;">Reliever:</td>
              <td style="padding: 10px 12px; font-weight: 700; color: #0f172a;">${request.relieverName || request.relieverId || '-'}</td>
            </tr>
            <!-- Row 6: Reason -->
            <tr style="border-bottom: 1px solid #cbd5e1;">
              <td style="padding: 10px 12px; font-weight: 600; color: #475569; background-color: #fafbfc; border-right: 1px solid #cbd5e1;">Reason:</td>
              <td colspan="3" style="padding: 10px 12px; font-weight: 700; color: #0f172a;">${request.reason || '-'}</td>
            </tr>
            <!-- Row 7: Approver status / flow -->
            <tr style="border-bottom: 1px solid #cbd5e1;">
              <td style="padding: 10px 12px; font-weight: 600; color: #475569; background-color: #fafbfc; border-right: 1px solid #cbd5e1;">Approval Flow:</td>
              <td colspan="3" style="padding: 10px 12px; font-weight: 700; color: #0f172a;">${approvalFlow || '-'}</td>
            </tr>
            <tr style="background-color: #f8fafc;">
              <td colspan="2" style="padding: 10px 12px; font-weight: 700; color: #0f172a; border-right: 1px solid #cbd5e1;">
                Current Approver: <span style="color: #2563eb;">${currentApproverName || '-'}</span> (Waiting)
              </td>
              <td colspan="2" style="padding: 10px 12px; font-weight: 700; color: #0f172a;">
                Status: <span style="color: #2563eb;">${status}</span>
              </td>
            </tr>
            ${remarks ? `
            <tr style="border-top: 1px solid #cbd5e1; background-color: #fffbeb;">
              <td style="padding: 10px 12px; font-weight: 600; color: #b45309; border-right: 1px solid #cbd5e1;">Remarks:</td>
              <td colspan="3" style="padding: 10px 12px; font-weight: 700; color: #78350f;">${remarks}</td>
            </tr>` : ''}
          </table>
        </div>

        <!-- Actions block -->
        <div style="padding: 0 24px 24px 24px; text-align: center; background-color: #fafafa; border-top: 1px solid #f1f5f9;">
          ${directApproveLink ? `
          <div style="margin-bottom: 12px; margin-top: 20px;">
            <a href="${directApproveLink}" style="display: inline-block; padding: 12px 28px; background: linear-gradient(135deg, #0284c7, #0369a1); color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px; box-shadow: 0 4px 6px -1px rgba(2, 132, 199, 0.2);">
              Click Here to Approve
            </a>
          </div>
          ` : ''}
          ${directRejectLink ? `
          <div style="margin-top: 12px; margin-bottom: 8px;">
            <a href="${directRejectLink}" style="display: inline-block; padding: 10px 24px; background: #ffffff; color: #dc2626; border: 1px solid #dc2626; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px;">
              Reject Request
            </a>
          </div>
          ` : ''}
          
          ${approvalLink ? `
          <div style="${directApproveLink ? 'margin-top: 12px;' : 'margin-top: 20px;'} margin-bottom: 8px;">
            <a href="${approvalLink}" style="display: inline-block; padding: 10px 24px; background: #ffffff; color: #0284c7; border: 1px solid #0284c7; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px;">
              View Request in Dashboard
            </a>
          </div>
          ` : ''}
          <p style="margin: 8px 0 0 0; font-size: 12px; color: #64748b;">This email was automatically generated by the Leave Management System.</p>
        </div>
      </div>
    </div>
  `;

  const text = [
    `Leave Request ${action}`,
    `Applicant ID: ${request.applicantId || '-'}`,
    `Applicant Name: ${request.applicantName || '-'}`,
    `Department: ${request.department || '-'}`,
    `Section: ${request.section || '-'}`,
    `Leave Type: ${request.leaveType || '-'}`,
    `Start Date: ${formatDate(request.startDate)}`,
    `End Date: ${formatDate(request.endDate)}`,
    `Total Days: ${request.totalDays || '-'}`,
    `Reason: ${request.reason || '-'}`,
    `Reliever ID: ${request.relieverId || '-'}`,
    `Reliever Name: ${request.relieverName || '-'}`,
    `Contact Number: ${request.contactNumber || '-'}`,
    `Approval Flow: ${approvalFlow || '-'}`,
    `Current Approver: ${currentApproverName || '-'}`,
    `Next Approver: ${nextApproverName || '-'}`,
    `Direct Approve Link: ${directApproveLink || '-'}`,
    `Direct Reject Link: ${directRejectLink || '-'}`,
    `Approval Link: ${approvalLink || '-'}`,
    `Status: ${status}`,
    `Remarks: ${remarks || '-'}`,
    `Sender: ${senderName}`,
  ].join('\n');

  return { html, text };
}

export function getApprovalLink(leaveId, approverId) {
  const id = String(leaveId || '').trim();
  if (!id) return '';

  const url = new URL(`${APP_URL}/dashboard/leave-approvals`);
  url.searchParams.set('requestId', id);
  if (approverId) {
    url.searchParams.set('approver', normalizeUserId(approverId));
  }
  return url.toString();
}

export function getDirectApproveLink(leaveId, approverId) {
  const id = String(leaveId || '').trim();
  if (!id) return '';

  const url = new URL(`${APP_URL}/api/leave/approve-direct`);
  url.searchParams.set('id', id);
  if (approverId) {
    url.searchParams.set('approver', normalizeUserId(approverId));
  }
  return url.toString();
}

export function getDirectRejectLink(leaveId, approverId) {
  const id = String(leaveId || '').trim();
  if (!id) return '';

  const url = new URL(`${APP_URL}/api/leave/approve-direct`);
  url.searchParams.set('id', id);
  url.searchParams.set('action', 'reject');
  if (approverId) {
    url.searchParams.set('approver', normalizeUserId(approverId));
  }
  return url.toString();
}

export async function sendMail({ to, subject, html, text }) {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !MAIL_FROM) {
    throw new Error('SMTP is not properly configured. Please set SMTP_HOST, SMTP_USER, SMTP_PASS, and MAIL_FROM.');
  }

  if (!to) {
    throw new Error('Recipient email is required.');
  }

  const result = await transporter.sendMail({
    from: MAIL_FROM,
    to,
    subject,
    text,
    html,
  });

  console.log(`Mail sent successfully to: ${to}`);
  return result;
}
