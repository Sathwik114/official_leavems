import sql from "mssql";

const config = {
  user: "paydev",
  password: "dev.gtipay@123",
  server: "10.40.10.105",
  database: "AttmSystem",
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

export async function getAttendance(empcode) {
  const pool = await getPool();

  // Get current month and year
  const month = String(new Date().getMonth() + 1).padStart(2, "0");
  const year = new Date().getFullYear();

  // Build table name (e.g. CAP072026)
  const tableName = `CAP${month}${year}`;


  const result = await pool
    .request()
    .input("empcode", sql.NVarChar, String(empcode))
    .query(`
      SELECT
        Empcode,
        DesigCode,
        AttDate,
        AttType,
        InTime,
        OutTime
      FROM ${tableName}
      WHERE Empcode = @empcode
      ORDER BY AttDate DESC
    `);

  return result.recordset;
}

export async function getAttendanceData(empcode, month, year) {
  try {
    const pool = await getPool();

    // Build table name (e.g. CAP072026)
    const monthStr = String(month).padStart(2, "0");
    const yearStr = String(year);
    const tableName = `CAP${monthStr}${yearStr}`;

    const result = await pool
      .request()
      .input("empcode", sql.NVarChar, String(empcode))
      .query(`
        SELECT
          Empcode,
          DesigCode,
          AttDate,
          AttType,
          InTime,
          OutTime
        FROM ${tableName}
        WHERE Empcode = @empcode
        ORDER BY AttDate ASC
      `);

    return result.recordset || [];
  } catch (err) {
    console.error(`Error fetching attendance for ${empcode}:`, err);
    return [];
  }
}

export async function getAttendanceEmployeeDetails(empcode) {
  const pool = await getPool();

  const result = await pool
    .request()
    .input('empcode', sql.NVarChar, String(empcode || '').trim())
    .query(`
      SELECT TOP 1
        EmpCode,
        DeptCode,
        NSecCode AS Section,
        Shift
      FROM dbo.EmpMast
      WHERE LTRIM(RTRIM(EmpCode)) = @empcode
    `);

  return result.recordset[0] || null;
}
