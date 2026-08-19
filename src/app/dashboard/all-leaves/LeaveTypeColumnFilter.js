'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';

const LEAVE_TYPES = [
  { value: '', label: 'All' },
  { value: 'EL', label: 'EL (P/EL, EL/P)' },
  { value: 'SL', label: 'SL' },
  { value: 'OD', label: 'OD' },
  { value: 'COFF', label: 'COFF' },
  { value: 'LWP', label: 'LWP (P/LWP, LWP/P)' },
  { value: 'P/7H', label: 'P/7H' },
];

export default function LeaveTypeColumnFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const leaveType = searchParams.get('leaveType') || '';

  const handleChange = (e) => {
    const value = e.target.value;
    const paramsObj = new URLSearchParams(searchParams.toString());
    if (value) {
      paramsObj.set('leaveType', value);
    } else {
      paramsObj.delete('leaveType');
    }
    router.replace(`${pathname}?${paramsObj.toString()}`);
  };

  return (
    <select
      className="columnFilterSelect"
      value={leaveType}
      onChange={handleChange}
      onClick={(e) => e.stopPropagation()}
      aria-label="Filter by leave type"
    >
      {LEAVE_TYPES.map((lt) => (
        <option key={lt.value} value={lt.value}>
          {lt.label}
        </option>
      ))}
    </select>
  );
}