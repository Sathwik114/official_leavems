import Link from 'next/link';
import { cookies } from 'next/headers';
import * as jose from 'jose';
import LogoutButton from './LogoutButton';
import {
  LEAVE_ROLE_RULES,
  isCccUser,
  isApproverUser,
  isApplicantUser,
  isHrUser,
  canAccessMonitorHod,
  canAccessMyAttendance,
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
  const isCCC = isCccUser(currentUserId);
  const isMfApplicant = mfApplicantIds.includes(currentUserId);
  const isAdmApplicant = admApplicantIds.includes(currentUserId);
  const isVipApplicant = vipApplicantIds.includes(currentUserId);
  const isApprover = isApproverUser(currentUserId);
  const isRoleUser = isApplicantUser(currentUserId) || isApprover;

  const isHr = isHrUser(currentUserId);
  const showMonitorHodLink = canAccessMonitorHod(currentUserId);
  const showMyAttendanceLink = canAccessMyAttendance(currentUserId);
  const showDashboardLink = !isCCC && !isHr;
  const showApproveLink = isCCC || (isApprover || isVipApplicant) && !isHr;
  const showMyLeavesLink = !isCCC && !isHr && (isMfApplicant || isAdmApplicant || isVipApplicant || isApprover);
  const showPendingLeavesLink = isHr;

  return (
    <div className="dashboardShell">
      <nav className="dashboardNavbar">
        <div className="dashboardNavBrand">
          <span className="dashboardNavBrandMark">GTI</span>
          <span className="dashboardNavBrandText">HOD&apos;s Leave Management System</span>
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
            {showMonitorHodLink && (
              <Link href="/dashboard/monitor-hod" className="dashboardNavLink">
                <span className="navIcon">📊</span> Monitor HOD&apos;s Attendance
              </Link>
            )}
            {showMyLeavesLink && (
              <Link href="/dashboard/my-leaves" className="dashboardNavLink">
                <span className="navIcon">📋</span> My Leaves
              </Link>
            )}
            {showMyAttendanceLink && (
              <Link href="/dashboard/my-attendance" className="dashboardNavLink">
                <span className="navIcon">🕒</span> My Attendance
              </Link>
            )}
            {showPendingLeavesLink && (
              <Link href="/dashboard/pending-leaves" className="dashboardNavLink">
                <span className="navIcon">📥</span> Track Pending Leave Status
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