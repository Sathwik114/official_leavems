'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DEFAULT_YEAR = '2026';
const DEFAULT_MONTH = String(new Date().getMonth() + 1); // current month

// Receives the currently-filtered leave rows (as loaded by the server page)
// so Download Excel exports exactly what's on screen.
export default function AllLeavesFilters({ leaves = [] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [year, setYear] = useState(searchParams.get('year') || DEFAULT_YEAR);
  const [month, setMonth] = useState(searchParams.get('month') || DEFAULT_MONTH);
  const [exporting, setExporting] = useState(false);

  const debounceRef = useRef(null);

  // Push year/month to the URL, debounced so it doesn't fetch on every keystroke.
  // Preserves any leaveType param already in the URL (set by the column filter).
  // 'month' is always written explicitly (including 'all') so the URL can
  // distinguish "nothing chosen yet" from "user picked All Months".
  const updateParams = (nextYear, nextMonth) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      const paramsObj = new URLSearchParams(searchParams.toString());
      if (nextYear) paramsObj.set('year', nextYear); else paramsObj.delete('year');
      paramsObj.set('month', nextMonth || 'all');

      const query = paramsObj.toString();
      router.replace(query ? `${pathname}?${query}` : pathname);
    }, 400);
  };

  const handleYearChange = (e) => {
    const value = e.target.value;
    setYear(value);
    updateParams(value, month);
  };

  const handleMonthChange = (e) => {
    const value = e.target.value; // '' when "All Months" is chosen
    setMonth(value);
    updateParams(year, value);
  };

  const handleClear = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setYear(DEFAULT_YEAR);
    setMonth(DEFAULT_MONTH);
    const paramsObj = new URLSearchParams(searchParams.toString());
    paramsObj.set('year', DEFAULT_YEAR);
    paramsObj.set('month', DEFAULT_MONTH);
    paramsObj.delete('leaveType');
    router.replace(`${pathname}?${paramsObj.toString()}`);
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  async function handleDownloadExcel() {
    if (!leaves.length) return;

    setExporting(true);
    try {
      const XLSX = await import('xlsx');

      const rows = leaves.map((leave) => ({
        'Applicant ID': leave.ApplicantId || '-',
        'Applicant Name': leave.ApplicantName || '-',
        Department: leave.Department || '-',
        Section: leave.Section || '-',
        'Start Date': leave.StartDate
          ? new Date(leave.StartDate).toLocaleDateString('en-GB')
          : '-',
        'End Date': leave.EndDate
          ? new Date(leave.EndDate).toLocaleDateString('en-GB')
          : '-',
        'From Time': leave.FromTime || '-',
        'To Time': leave.ToTime || '-',
        'HOD Status': leave.HodStatus || '-',
        'CCC Status': leave.CccStatus || '-',
        'Leave Type': leave.LeaveType || '-',
        Reason: leave.Reason || '-',
      }));

      const worksheet = XLSX.utils.json_to_sheet(rows);
      worksheet['!cols'] = [
        { wch: 12 }, { wch: 20 }, { wch: 14 }, { wch: 12 },
        { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 10 },
        { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 30 },
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'All Leaves');

      const monthLabel = month ? MONTH_NAMES[parseInt(month, 10) - 1] : 'AllMonths';
      const yearLabel = year || DEFAULT_YEAR;
      const leaveTypeParam = searchParams.get('leaveType');
      const leaveTypeLabel = leaveTypeParam ? `_${leaveTypeParam.replace('/', '-')}` : '';
      const fileName = `All_Leaves_${yearLabel}_${monthLabel}${leaveTypeLabel}.xlsx`;

      XLSX.writeFile(workbook, fileName);
    } catch (err) {
      console.error('Failed to export all leaves to Excel:', err);
    } finally {
      setExporting(false);
    }
  }

  const isFiltered =
    year !== DEFAULT_YEAR || month !== DEFAULT_MONTH || searchParams.get('leaveType');

  return (
    <div className="allLeavesFilters">
      <div className="filterGroup">
        <label htmlFor="year">Year</label>
        <input
          id="year"
          name="year"
          type="text"
          inputMode="numeric"
          maxLength={4}
          placeholder="e.g. 2026"
          value={year}
          onChange={handleYearChange}
        />
      </div>

      <div className="filterGroup">
        <label htmlFor="month">Month</label>
        <select id="month" name="month" value={month} onChange={handleMonthChange}>
          <option value="">All Months</option>
          {MONTH_NAMES.map((name, i) => (
            <option key={name} value={i + 1}>
              {name}
            </option>
          ))}
        </select>
      </div>

      {isFiltered && (
        <button type="button" className="filterClearBtn" onClick={handleClear}>
          Clear
        </button>
      )}

      <button
        type="button"
        className="allLeavesDownloadButton"
        onClick={handleDownloadExcel}
        disabled={exporting || leaves.length === 0}
      >
        {exporting ? 'Exporting…' : '⬇️ Download Excel'}
      </button>
    </div>
  );
}