import sql from "mssql";

const config = {
  user: "paydev",
  password: "dev.gtipay@123",
  server: "10.40.10.105",
  database: "Payroll",
  port: 1433,
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
};

let poolPromise;

async function getPool() {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(config).connect();
  }
  return poolPromise;
}

export async function getEmployeeDetails(empcode) {
  const pool = await getPool();

  const result = await pool
    .request()
    .input("empcode", sql.NVarChar, String(empcode).trim())
    .query(`
      SELECT TOP 1
          EmpCode,
          EmpName,
          DeptCode,
          NSecCode AS Section,
          Shift,
          EmpType,
          EL AS EarnLeaveBalance,
          CL AS SickLeaveBalance
      FROM EmpMast
      WHERE LTRIM(RTRIM(EmpCode)) = @empcode
    `);

  return result.recordset[0] || null;
}

// Maps a submitted leave type (including half-day variants like 'EL/P', 'P/EL')
// to the EmpMast column that tracks its balance. LWP/COFF/OD/etc. return null
// since they don't draw against a balance column.
const LEAVE_BALANCE_COLUMNS = {
  EL: 'EL',
  SL: 'CL',
};

function resolveLeaveBalanceColumn(leaveType) {
  const normalized = String(leaveType || '').toUpperCase();

  if (normalized.includes('EL')) return LEAVE_BALANCE_COLUMNS.EL;
  if (normalized.includes('SL')) return LEAVE_BALANCE_COLUMNS.SL;

  return null;
}

export async function deductLeaveBalance(empcode, leaveType, days) {
  const column = resolveLeaveBalanceColumn(leaveType);
  if (!column) return null; // e.g. LWP, COFF, OD — no balance to touch

  const deduction = Number(days);
  if (!Number.isFinite(deduction) || deduction <= 0) return null;

  const pool = await getPool();
  const trimmedEmpcode = String(empcode || '').trim();

  await pool.request()
    .input('empcode', sql.NVarChar, trimmedEmpcode)
    .input('days', sql.Decimal(10, 2), deduction)
    .query(`
      UPDATE EmpMast
      SET [${column}] = CASE WHEN [${column}] - @days < 0 THEN 0 ELSE [${column}] - @days END
      WHERE LTRIM(RTRIM(EmpCode)) = @empcode
    `);

  const result = await pool.request()
    .input('empcode', sql.NVarChar, trimmedEmpcode)
    .query(`SELECT [${column}] AS UpdatedBalance FROM EmpMast WHERE LTRIM(RTRIM(EmpCode)) = @empcode`);

  return result.recordset[0]?.UpdatedBalance ?? null;
}

export async function refundLeaveBalance(empcode, leaveType, days) {
  const column = resolveLeaveBalanceColumn(leaveType);
  if (!column) return null;

  const refund = Number(days);
  if (!Number.isFinite(refund) || refund <= 0) return null;

  const pool = await getPool();
  const trimmedEmpcode = String(empcode || '').trim();

  await pool.request()
    .input('empcode', sql.NVarChar, trimmedEmpcode)
    .input('days', sql.Decimal(10, 2), refund)
    .query(`
      UPDATE EmpMast
      SET [${column}] = [${column}] + @days
      WHERE LTRIM(RTRIM(EmpCode)) = @empcode
    `);

  const result = await pool.request()
    .input('empcode', sql.NVarChar, trimmedEmpcode)
    .query(`SELECT [${column}] AS UpdatedBalance FROM EmpMast WHERE LTRIM(RTRIM(EmpCode)) = @empcode`);

  return result.recordset[0]?.UpdatedBalance ?? null;
}