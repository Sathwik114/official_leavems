import { NextResponse } from "next/server";
import { getEmployeeDetails } from "@/lib/payrollDb";
import { getAttendanceData, getPreviousMonthEndRows } from "@/lib/attendanceDb";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const empcode = searchParams.get("empcode");
  const month = searchParams.get("month");
  const year = searchParams.get("year");

  if (!empcode) {
    return NextResponse.json({ error: "empcode is required" }, { status: 400 });
  }

  try {
    const employee = await getEmployeeDetails(empcode);
    
    let attendance = [];
    const includePreviousTopRows = searchParams.get('includePreviousTopRows') === 'true';
    if (month && year) {
      attendance = await getAttendanceData(empcode, parseInt(month), parseInt(year));
    } else if (includePreviousTopRows) {
      attendance = await getPreviousMonthEndRows(empcode);
    }

    return NextResponse.json({ employee, attendance });
  } catch (err) {
    console.error("Employee lookup error:", err);
    return NextResponse.json({ error: "Failed to fetch employee", details: err.message }, { status: 500 });
  }
}
