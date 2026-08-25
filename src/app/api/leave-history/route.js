import { NextResponse } from "next/server";
import { getLeaveRequestsForApplicant } from "@/lib/leaveDb";
import { getEmployeeDetails } from "@/lib/payrollDb";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const empcode = searchParams.get("empcode");
  const year = searchParams.get("year");

  if (!empcode) {
    return NextResponse.json({ error: "empcode is required" }, { status: 400 });
  }

  try {
    const [employee, rawLeave] = await Promise.all([
      getEmployeeDetails(empcode),
      getLeaveRequestsForApplicant(empcode),
    ]);

    let leave = rawLeave;
    if (year) {
      const y = parseInt(year, 10);
      leave = rawLeave.filter((req) => {
        const d = new Date(req.StartDate || req.FromDate || req.CreatedAt || req.DateApplied);
        return d.getFullYear() === y;
      });
    }

    return NextResponse.json({ employee, leave });
  } catch (err) {
    console.error("Leave history lookup error:", err);
    return NextResponse.json(
      { error: "Failed to fetch leave records", details: err.message },
      { status: 500 }
    );
  }
}