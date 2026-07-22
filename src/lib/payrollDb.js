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
          EmpType
      FROM EmpMast
      WHERE LTRIM(RTRIM(EmpCode)) = @empcode
    `);

  return result.recordset[0] || null;
}
