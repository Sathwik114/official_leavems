export function normalizeApproverList(value) {
  if (!value) return [];

  const rawValues = Array.isArray(value)
    ? value
    : String(value)
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);

  const seen = new Set();

  return rawValues.filter((item) => {
    if (!item || seen.has(item)) return false;
    seen.add(item);
    return true;
  });
}

export function formatApproverList(value) {
  const normalized = normalizeApproverList(value);
  return normalized.length > 0 ? normalized.join(', ') : '-';
}
