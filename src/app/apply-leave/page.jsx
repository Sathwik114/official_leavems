import { getEmployeeDetails } from "@/lib/payrollDb";
import ApplyLeaveForm from "./ApplyLeaveForm";

export default async function ApplyLeavePage({ searchParams }) {
  const params = await searchParams;
  const empcode = params?.empcode || "";

  let employee = null;
  if (empcode) {
    try {
      employee = await getEmployeeDetails(empcode);
    } catch (err) {
      console.error("Employee fetch error:", err);
    }
  }

  return <ApplyLeaveForm employee={employee} />;
}