import { NextResponse } from "next/server";
import { getEmployeeDetails } from "@/lib/payrollDb";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const empcode = searchParams.get("empcode");

  if (!empcode) {
    return NextResponse.json({ error: "empcode is required" }, { status: 400 });
  }

  try {
    const employee = await getEmployeeDetails(empcode);
    return NextResponse.json({ employee });
  } catch (err) {
    console.error("Employee lookup error:", err);
    return NextResponse.json({ error: "Failed to fetch employee" }, { status: 500 });
  }
}