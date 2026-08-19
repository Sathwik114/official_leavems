export const LEAVE_ROLE_RULES = {
  mf: {
    ids: ['101024', '101027', '101049', '150121', '180272', '260296'],
    approverIds: ['250479', '100002'],
  },
  adm: {
    ids: ['120124', '120137', '111254'],
    approverIds: ['250479', '140287'],
  },
  vip: {
    ids: ['250479','111137', '210231', '111069', '100209'],
    approverIds: ['140287'],
  },
  special: {
    ccc: '140287',
  },
  hr: {
    ids: ['111233'],
  }
};

const normalizeId = (value) => String(value || '').trim();

export function getCccUserId() {
  return normalizeId(LEAVE_ROLE_RULES.special?.ccc);
}

export function isCccUser(userId) {
  return normalizeId(userId) === getCccUserId();
}

export function isHrUser(userId) {
  return (LEAVE_ROLE_RULES.hr?.ids || []).map(normalizeId).includes(normalizeId(userId));
}

export function isMfPrimaryApprover(userId) {
  const primaryApproverId = normalizeId(LEAVE_ROLE_RULES.mf?.approverIds?.[0]);
  return Boolean(primaryApproverId) && normalizeId(userId) === primaryApproverId;
}

export function isMfApprover(userId) {
  return (LEAVE_ROLE_RULES.mf?.approverIds || []).map(normalizeId).includes(normalizeId(userId));
}

export function isAdmPrimaryApprover(userId) {
  const primaryApproverId = normalizeId(LEAVE_ROLE_RULES.adm?.approverIds?.[0]);
  return Boolean(primaryApproverId) && normalizeId(userId) === primaryApproverId;
}

export function canAccessMonitorHod(userId) {
  const normalizedUserId = normalizeId(userId);
  return (
    isCccUser(normalizedUserId) ||
    isHrUser(normalizedUserId) ||
    isMfPrimaryApprover(normalizedUserId) ||
    isAdmPrimaryApprover(normalizedUserId)
  );
}

export function canAccessMyAttendance(userId) {
  const normalizedUserId = normalizeId(userId);
  if (!normalizedUserId) return false;
  if (isCccUser(normalizedUserId)) return false;
  if (isHrUser(normalizedUserId)) return false;
  if (isMfPrimaryApprover(normalizedUserId)) return false;
  return true;
}

function appendMonitorHodEntries(entries, ids, roleLabel) {
  for (const id of ids || []) {
    const normalizedId = normalizeId(id);
    if (!normalizedId) continue;
    entries.push({ id: normalizedId, name: `${normalizedId} - ${roleLabel}` });
  }
}

export function getMonitorHodListEntries(userId) {
  const normalizedUserId = normalizeId(userId);
  const hiddenIds = new Set(['100209'].map(normalizeId));

  if (isCccUser(normalizedUserId) || isHrUser(normalizedUserId)) {
    const entries = [];

    // VIP ids, with hidden ids already removed. These 3 are pulled out
    // and placed at the top of the table in this exact order; the
    // remaining VIP ids are appended after MF/ADM as before.
    const vipIds = (LEAVE_ROLE_RULES.vip.ids || [])
      .map(normalizeId)
      .filter((id) => !hiddenIds.has(id));
    const priorityOrder = ['210231', '111137', '111069'];
    const priorityVipIds = priorityOrder.filter((id) => vipIds.includes(id));
    const remainingVipIds = vipIds.filter((id) => !priorityOrder.includes(id));

    appendMonitorHodEntries(entries, priorityVipIds, 'VIP');
    appendMonitorHodEntries(entries, LEAVE_ROLE_RULES.mf.ids, 'MF');
    appendMonitorHodEntries(entries, LEAVE_ROLE_RULES.adm.ids, 'ADM');
    appendMonitorHodEntries(entries, remainingVipIds, 'VIP');

    return entries;
  }

  if (isMfPrimaryApprover(normalizedUserId)) {
    const entries = [];
    appendMonitorHodEntries(entries, LEAVE_ROLE_RULES.mf.ids, 'MF');
    return entries;
  }

  if (isAdmPrimaryApprover(normalizedUserId)) {
    const hiddenIds = new Set(['100209'].map(normalizeId));
    const entries = [];
    appendMonitorHodEntries(entries, LEAVE_ROLE_RULES.adm.ids, 'ADM');
    appendMonitorHodEntries(entries, LEAVE_ROLE_RULES.vip.ids, 'VIP');
    const seen = new Set();
    return entries.filter((entry) => {
      if (hiddenIds.has(entry.id)) return false;
      if (seen.has(entry.id)) return false;
      seen.add(entry.id);
      return true;
    });
  }

  return [];
}

export function getDashboardRedirectForUser(userId) {
  const normalizedUserId = normalizeId(userId);

  if (isHrUser(normalizedUserId)) {
    return '/dashboard/pending-leaves';
  }

  if (isCccUser(normalizedUserId) || isMfApprover(normalizedUserId)) {
    return '/dashboard/leave-approvals';
  }

  if (
    LEAVE_ROLE_RULES.mf.ids.map(normalizeId).includes(normalizedUserId) ||
    LEAVE_ROLE_RULES.adm.ids.map(normalizeId).includes(normalizedUserId)
  ) {
    return '/apply-leave';
  }

  return '/dashboard/leave-approvals';
}

export function getAllApplicantIds() {
  return [
    ...(LEAVE_ROLE_RULES.mf.ids || []),
    ...(LEAVE_ROLE_RULES.adm.ids || []),
    ...(LEAVE_ROLE_RULES.vip.ids || []),
    ...(LEAVE_ROLE_RULES.hr?.ids || []),
  ].map(normalizeId);
}

export function getAllApproverIds() {
  return [
    ...(LEAVE_ROLE_RULES.mf.approverIds || []),
    ...(LEAVE_ROLE_RULES.adm.approverIds || []),
    ...(LEAVE_ROLE_RULES.vip.approverIds || []),
  ].map(normalizeId);
}

export function isApplicantUser(userId) {
  return getAllApplicantIds().includes(normalizeId(userId));
}

export function isApproverUser(userId) {
  return getAllApproverIds().includes(normalizeId(userId));
}

function buildApprovalFlow(role, fallbackApprovers = []) {
  const rule = LEAVE_ROLE_RULES[role];
  const approverIds = (rule?.approverIds || fallbackApprovers).map(normalizeId);

  return {
    role,
    flow: approverIds,
    initialApprover: approverIds[0] || '',
  };
}

export function getLeaveApprovalFlow(applicantId) {
  const normalizedApplicantId = normalizeId(applicantId);

  if (LEAVE_ROLE_RULES.mf.ids.map(normalizeId).includes(normalizedApplicantId)) {
    return buildApprovalFlow('mf', [
      '250479',
      getCccUserId(),
    ]);
  }

  if (LEAVE_ROLE_RULES.adm.ids.map(normalizeId).includes(normalizedApplicantId)) {
    return buildApprovalFlow('adm', [
      getCccUserId(),
    ]);
  }

  if (LEAVE_ROLE_RULES.vip.ids.map(normalizeId).includes(normalizedApplicantId)) {
    const vipApproverIds = (LEAVE_ROLE_RULES.vip.approverIds || []).map(normalizeId);

    return {
      role: 'vip',
      flow: [normalizedApplicantId, ...vipApproverIds],
      initialApprover: normalizedApplicantId,
    };
  }

  return null;
}

export function canApplyLeave(currentUserUsername = '', applicantId = '') {
  if (isCccUser(currentUserUsername)) {
    return false;
  }

  return Boolean(getLeaveApprovalFlow(applicantId, currentUserUsername));
}