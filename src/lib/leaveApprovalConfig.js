import { getPool } from './leaveDb';

const normalizeId = (value) => String(value || '').trim();

async function ensureLeaveRoleMembersTable() {
  const pool = await getPool();
  await pool.request().query(`
    IF OBJECT_ID(N'dbo.LeaveRoleMembers', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.LeaveRoleMembers (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        RoleCode NVARCHAR(20) NOT NULL,
        MembershipType NVARCHAR(20) NOT NULL,
        UserId NVARCHAR(100) NOT NULL,
        SortOrder INT NOT NULL DEFAULT 0,
        IsActive BIT NOT NULL DEFAULT 1,
        CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
        UpdatedAt DATETIME NOT NULL DEFAULT GETDATE(),
        CONSTRAINT UQ_LeaveRoleMembers UNIQUE (RoleCode, MembershipType, UserId)
      );
    END;

    IF NOT EXISTS (SELECT 1 FROM dbo.LeaveRoleMembers)
    BEGIN
      INSERT INTO dbo.LeaveRoleMembers (RoleCode, MembershipType, UserId, SortOrder)
      SELECT 'MF', 'APPLICANT', '101024', 1
      UNION ALL SELECT 'MF', 'APPLICANT', '101027', 2
      UNION ALL SELECT 'MF', 'APPLICANT', '101049', 3
      UNION ALL SELECT 'MF', 'APPLICANT', '150121', 4
      UNION ALL SELECT 'MF', 'APPLICANT', '180272', 5
      UNION ALL SELECT 'MF', 'APPLICANT', '230022', 6
      UNION ALL SELECT 'MF', 'APPROVER', '250479', 1
      UNION ALL SELECT 'MF', 'APPROVER', '140287', 2
      UNION ALL SELECT 'ADM', 'APPLICANT', '120124', 1
      UNION ALL SELECT 'ADM', 'APPLICANT', '120137', 2
      UNION ALL SELECT 'ADM', 'APPLICANT', '111254', 3
      UNION ALL SELECT 'ADM', 'APPLICANT', '111075', 4
      UNION ALL SELECT 'ADM', 'APPLICANT', '170228', 5
      UNION ALL SELECT 'ADM', 'APPLICANT', '220341', 6
      UNION ALL SELECT 'ADM', 'APPLICANT', '220579', 7
      UNION ALL SELECT 'ADM', 'APPLICANT', '260296', 8
      UNION ALL SELECT 'ADM', 'APPROVER', '250479', 1
      UNION ALL SELECT 'ADM', 'APPROVER', '140287', 2
      UNION ALL SELECT 'VIP', 'APPLICANT', '111137', 1
      UNION ALL SELECT 'VIP', 'APPLICANT', '210231', 2
      UNION ALL SELECT 'VIP', 'APPLICANT', '111069', 3
      UNION ALL SELECT 'VIP', 'APPLICANT', '100209', 4
      UNION ALL SELECT 'VIP', 'APPROVER', '140287', 1
      UNION ALL SELECT 'SPECIAL', 'CCC', '140287', 1
      UNION ALL SELECT 'HR', 'HR', '111233', 1;
    END;
  `);
}

export async function getLeaveRoleRules() {
  await ensureLeaveRoleMembersTable();
  const result = await (await getPool()).request().query(`
    SELECT RoleCode, MembershipType, UserId FROM dbo.LeaveRoleMembers
    WHERE IsActive = 1 ORDER BY RoleCode, MembershipType, SortOrder, Id;
  `);
  const rules = { mf: { ids: [], approverIds: [] }, adm: { ids: [], approverIds: [] }, vip: { ids: [], approverIds: [] }, special: { ccc: '' }, hr: { ids: [] } };
  for (const row of result.recordset || []) {
    const userId = normalizeId(row.UserId);
    const role = String(row.RoleCode || '').toUpperCase();
    const membership = String(row.MembershipType || '').toUpperCase();
    if (!userId) continue;
    if (role === 'SPECIAL' && membership === 'CCC' && !rules.special.ccc) rules.special.ccc = userId;
    if (role === 'HR' && membership === 'HR') rules.hr.ids.push(userId);
    if (role === 'MF' && membership === 'APPLICANT') rules.mf.ids.push(userId);
    if (role === 'MF' && membership === 'APPROVER') rules.mf.approverIds.push(userId);
    if (role === 'ADM' && membership === 'APPLICANT') rules.adm.ids.push(userId);
    if (role === 'ADM' && membership === 'APPROVER') rules.adm.approverIds.push(userId);
    if (role === 'VIP' && membership === 'APPLICANT') rules.vip.ids.push(userId);
    if (role === 'VIP' && membership === 'APPROVER') rules.vip.approverIds.push(userId);
  }
  return rules;
}

export async function getCccUserId() {
  return normalizeId((await getLeaveRoleRules()).special.ccc);
}

export async function isCccUser(userId) {
  const cccUserId = await getCccUserId();
  return Boolean(cccUserId) && normalizeId(userId) === cccUserId;
}

export async function isHrUser(userId) {
  return (await getLeaveRoleRules()).hr.ids.includes(normalizeId(userId));
}

export async function isMfPrimaryApprover(userId) {
  const primaryApproverId = normalizeId((await getLeaveRoleRules()).mf.approverIds[0]);
  return Boolean(primaryApproverId) && normalizeId(userId) === primaryApproverId;
}

export async function isMfApprover(userId) {
  return (await getLeaveRoleRules()).mf.approverIds.includes(normalizeId(userId));
}

export async function isAdmPrimaryApprover(userId) {
  const primaryApproverId = normalizeId((await getLeaveRoleRules()).adm.approverIds[0]);
  return Boolean(primaryApproverId) && normalizeId(userId) === primaryApproverId;
}

export async function canAccessMonitorHod(userId) {
  const id = normalizeId(userId);
  if (!id) return false;
  const rules = await getLeaveRoleRules();
  const cccUserId = normalizeId(rules.special.ccc);
  const mfPrimaryApproverId = normalizeId(rules.mf.approverIds[0]);
  const admPrimaryApproverId = normalizeId(rules.adm.approverIds[0]);
  return (Boolean(cccUserId) && id === cccUserId) || rules.hr.ids.includes(id)
    || (Boolean(mfPrimaryApproverId) && id === mfPrimaryApproverId)
    || (Boolean(admPrimaryApproverId) && id === admPrimaryApproverId);
}

export async function canAccessMyAttendance(userId) {
  const id = normalizeId(userId);
  if (!id) return false;
  const rules = await getLeaveRoleRules();
  const cccUserId = normalizeId(rules.special.ccc);
  const mfPrimaryApproverId = normalizeId(rules.mf.approverIds[0]);
  return (!cccUserId || id !== cccUserId) && !rules.hr.ids.includes(id)
    && (!mfPrimaryApproverId || id !== mfPrimaryApproverId);
}

function appendMonitorHodEntries(entries, ids, roleLabel) {
  for (const id of ids || []) if (normalizeId(id)) entries.push({ id: normalizeId(id), name: `${normalizeId(id)} - ${roleLabel}` });
}

export async function getMonitorHodListEntries(userId) {
  const id = normalizeId(userId);
  const rules = await getLeaveRoleRules();
  const hiddenIds = new Set(['100209']);
  if (id === normalizeId(rules.special.ccc) || rules.hr.ids.includes(id)) {
    const entries = [];
    const vipIds = rules.vip.ids.filter((value) => !hiddenIds.has(value));
    const priorityOrder = ['210231', '111137', '111069'];
    appendMonitorHodEntries(entries, priorityOrder.filter((value) => vipIds.includes(value)), 'VIP');
    appendMonitorHodEntries(entries, rules.mf.ids, 'MF');
    appendMonitorHodEntries(entries, rules.adm.ids, 'ADM');
    appendMonitorHodEntries(entries, vipIds.filter((value) => !priorityOrder.includes(value)), 'VIP');
    return entries;
  }
  if (id === normalizeId(rules.mf.approverIds[0])) {
    const entries = []; appendMonitorHodEntries(entries, rules.mf.ids, 'MF'); return entries;
  }
  if (id === normalizeId(rules.adm.approverIds[0])) {
    const entries = []; appendMonitorHodEntries(entries, rules.adm.ids, 'ADM'); appendMonitorHodEntries(entries, rules.vip.ids, 'VIP');
    const seen = new Set();
    return entries.filter((entry) => !hiddenIds.has(entry.id) && !seen.has(entry.id) && seen.add(entry.id));
  }
  return [];
}

export async function getDashboardRedirectForUser(userId) {
  const id = normalizeId(userId);
  const rules = await getLeaveRoleRules();
  if (rules.hr.ids.includes(id)) return '/dashboard/pending-leaves';
  if (id === normalizeId(rules.special.ccc) || rules.mf.approverIds.includes(id)) return '/dashboard/leave-approvals';
  if (rules.mf.ids.includes(id) || rules.adm.ids.includes(id)) return '/apply-leave';
  return '/dashboard/leave-approvals';
}

export async function getAllApplicantIds() {
  const rules = await getLeaveRoleRules();
  return [...rules.mf.ids, ...rules.adm.ids, ...rules.vip.ids, ...rules.hr.ids];
}

export async function getAllApproverIds() {
  const rules = await getLeaveRoleRules();
  return [...rules.mf.approverIds, ...rules.adm.approverIds, ...rules.vip.approverIds];
}

export async function isApplicantUser(userId) { return (await getAllApplicantIds()).includes(normalizeId(userId)); }
export async function isApproverUser(userId) { return (await getAllApproverIds()).includes(normalizeId(userId)); }

export async function getLeaveApprovalFlow(applicantId) {
  const id = normalizeId(applicantId);
  if (!id) return null;

  const result = await (await getPool()).request()
    .input('EmpCode', id)
    .query(`
      SELECT TOP 1 EmpCategory, VicePresident, President
      FROM dbo.LeaveApprovalFlow
      WHERE LTRIM(RTRIM(EmpCode)) = @EmpCode
    `);

  const row = result.recordset[0];
  if (!row) return null;

  const role = String(row.EmpCategory || '').trim().toLowerCase();
  if (!['mf', 'adm', 'vip'].includes(role)) return null;

  const specialCccUserId = await getCccUserId();
  const flow = [row.VicePresident, specialCccUserId || row.President]
    .map(normalizeId)
    .filter(Boolean);
  if (!flow.length) return null;

  return {
    role,
    flow,
    initialApprover: flow[0],
  };
}

export async function canApplyLeave(currentUserUsername = '', applicantId = '') {
  if (await isCccUser(currentUserUsername)) return false;
  return Boolean(await getLeaveApprovalFlow(applicantId));
}
