'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default function AllLeavesFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [year, setYear] = useState(searchParams.get('year') || '');
  const [month, setMonth] = useState(searchParams.get('month') || '');

  const debounceRef = useRef(null);

  // Push year/month to the URL, debounced so it doesn't fetch on every keystroke
  const updateParams = (nextYear, nextMonth) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      const paramsObj = new URLSearchParams();
      if (nextYear) paramsObj.set('year', nextYear);
      if (nextMonth) paramsObj.set('month', nextMonth);

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
    const value = e.target.value;
    setMonth(value);
    updateParams(year, value);
  };

  const handleClear = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setYear('');
    setMonth('');
    router.replace(pathname);
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

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
          placeholder="e.g. 2025"
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

      {(year || month) && (
        <button type="button" className="filterClearBtn" onClick={handleClear}>
          Clear
        </button>
      )}
    </div>
  );
}