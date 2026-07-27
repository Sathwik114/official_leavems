import { NextResponse } from "next/server";
import { getLeaveData } from "@/lib/attendanceDb";
import { getEmployeeDetails } from "@/lib/payrollDb";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const empcode = searchParams.get("empcode");
  const year = searchParams.get("year");

  if (!empcode) {
    return NextResponse.json({ error: "empcode is required" }, { status: 400 });
  }

  try {
    const [employee, leave] = await Promise.all([
      getEmployeeDetails(empcode),
      getLeaveData(empcode, year ? parseInt(year) : null),
    ]);

    return NextResponse.json({ employee, leave });
  } catch (err) {
    console.error("Leave history lookup error:", err);
    return NextResponse.json(
      { error: "Failed to fetch leave records", details: err.message },
      { status: 500 }
    );
  }
}