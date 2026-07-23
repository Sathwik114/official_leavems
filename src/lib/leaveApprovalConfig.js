export const LEAVE_ROLE_RULES = {
  mf: {
    ids: ['101024', '101027', '101049', '150121', '180272', '260296'],
    approverIds: ['250479', '140287'],
  },
  adm: {
    ids: ['120124', '120137', '111254'],
    approverIds: ['230022', '140287'],
  },
  vip: {
    ids: ['111137', '210237', '111069', '100209'],
    approverIds: ['140287'],
  },
  special: {
    ccc: '140287',
  },
};

const normalizeId = (value) => String(value || '').trim();

export function getCccUserId() {
  return normalizeId(LEAVE_ROLE_RULES.special?.ccc);
}

export function isCccUser(userId) {
  return normalizeId(userId) === getCccUserId();
}

export function getDashboardRedirectForUser(userId) {
  return isCccUser(userId) ? '/dashboard/leave-approvals' : '/dashboard';
}

export function getAllApplicantIds() {
  return [
    ...(LEAVE_ROLE_RULES.mf.ids || []),
    ...(LEAVE_ROLE_RULES.adm.ids || []),
    ...(LEAVE_ROLE_RULES.vip.ids || []),
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

export function getLeaveApprovalFlow(applicantId, currentUserUsername = '') {
  const normalizedApplicantId = normalizeId(applicantId);
  const normalizedUserId = normalizeId(currentUserUsername);

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

  if (
    LEAVE_ROLE_RULES.vip.ids.map(normalizeId).includes(normalizedApplicantId) ||
    LEAVE_ROLE_RULES.vip.ids.map(normalizeId).includes(normalizedUserId)
  ) {
    const selfApprover = LEAVE_ROLE_RULES.vip.ids.map(normalizeId).includes(normalizedUserId)
      ? normalizedUserId
      : normalizedApplicantId;

    return {
      role: 'vip',
      flow: [selfApprover, getCccUserId()],
      initialApprover: selfApprover,
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
