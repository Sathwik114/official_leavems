import Link from 'next/link';
import { cookies } from 'next/headers';
import * as jose from 'jose';
import LogoutButton from './LogoutButton';
import {
  LEAVE_ROLE_RULES,
  isCccUser,
  isHrUser,
  isApproverUser,
  isApplicantUser,
} from '@/lib/leaveApprovalConfig';
import './layout.css';

export default async function DashboardLayout({ children }) {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;
  let currentUserId = '';

  if (token) {
    try {
      const secret = new TextEncoder().encode(process.env.JWT_SECRET);
      const { payload } = await jose.jwtVerify(token, secret);
      currentUserId = String(payload.username || payload.name || '').trim();
    } catch (err) {
      console.error('JWT Error:', err);
    }
  }

  const mfApplicantIds = LEAVE_ROLE_RULES.mf.ids || [];
  const admApplicantIds = LEAVE_ROLE_RULES.adm.ids || [];
  const vipApplicantIds = LEAVE_ROLE_RULES.vip.ids || [];
  const approverIds = [
    ...(LEAVE_ROLE_RULES.mf.approverIds || []),
    ...(LEAVE_ROLE_RULES.adm.approverIds || []),
    ...(LEAVE_ROLE_RULES.vip.approverIds || []),
  ];

  const isCCC = isCccUser(currentUserId);
  const isHR = isHrUser(currentUserId);
  const isMfApplicant = mfApplicantIds.includes(currentUserId);
  const isAdmApplicant = admApplicantIds.includes(currentUserId);
  const isVipApplicant = vipApplicantIds.includes(currentUserId);
  const isApprover = isApproverUser(currentUserId);
  const isRoleUser = isApplicantUser(currentUserId) || isApprover;

  const showDashboardLink = !isCCC && !isHR;
  const showApproveLink = isCCC || isHR || isApprover || isVipApplicant;
  const showMyLeavesLink = !isCCC && !isHR && (isMfApplicant || isAdmApplicant || isVipApplicant || isApprover);

  return (
    <div className="dashboardShell">
      <nav className="dashboardNavbar">
        <div className="dashboardNavBrand">
          <span className="dashboardNavBrandMark">GTI</span>
          <span className="dashboardNavBrandText">Official&apos;s Leave Management System</span>
        </div>

        <div className="dashboardNavRight">
          <div className="dashboardNavLinks">
            {showDashboardLink && (
              <Link href="/dashboard" className="dashboardNavLink">
                <span className="navIcon">🏠</span> Dashboard
              </Link>
            )}
            {showApproveLink && (
              <Link href="/dashboard/leave-approvals" className="dashboardNavLink">
                <span className="navIcon">✅</span> Approve a Leave
              </Link>
            )}
            {showMyLeavesLink && (
              <Link href="/dashboard/my-leaves" className="dashboardNavLink">
                <span className="navIcon">📋</span> My Leaves
              </Link>
            )}
            {isCCC && (
              <Link href="/dashboard/monitor-hod" className="dashboardNavLink">
                <span className="navIcon">📊</span> Monitor HOD&apos;s Attendance
              </Link>
            )}
          </div>
          <span className="dashboardNavDivider" />
          <LogoutButton />
        </div>
      </nav>
      {children}
    </div>
  );
}