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
        ActInTime,
        OutTime,
        ActOutTime
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

function getCurrentAttendanceTableName() {
  const now = new Date();
  return `CAP${String(now.getMonth() + 1).padStart(2, '0')}${now.getFullYear()}`;
}

export async function updateAttendanceTime(empcode, attendanceDate, timeField, timeValue) {
  const columnMap = {
    in: ['ActInTime', 'InTime'],
    out: ['ActOutTime', 'OutTime'],
  };
  const columns = columnMap[timeField];

  if (!columns) {
    throw new Error('Time field must be either "in" or "out".');
  }

  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(timeValue || ''))) {
    throw new Error('Time must be in HH:mm format.');
  }

  const pool = await getPool();
  const tableName = getCurrentAttendanceTableName();
  const typeResult = await pool.request()
    .input('TableName', sql.NVarChar, tableName)
    .query(`
      SELECT COLUMN_NAME, DATA_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = @TableName
        AND COLUMN_NAME IN ('ActInTime', 'InTime', 'ActOutTime', 'OutTime');
    `);

  const types = new Map(typeResult.recordset.map((column) => [column.COLUMN_NAME, column.DATA_TYPE]));
  if (!types.has(columns[0]) || !types.has(columns[1])) {
    throw new Error(`The current attendance table does not contain ${columns.join(' and ')}.`);
  }

  const dateTimeTypes = new Set(['datetime', 'datetime2', 'smalldatetime', 'datetimeoffset']);
  const timeExpression = (column) => (
    dateTimeTypes.has(types.get(column).toLowerCase())
      ? "CAST(CONVERT(varchar(10), @AttendanceDate, 120) + ' ' + @TimeValue + ':00' AS datetime)"
      : "@TimeValue + ':00'"
  );

  const result = await pool.request()
    .input('EmpCode', sql.NVarChar, String(empcode || '').trim())
    .input('AttendanceDate', sql.DateTime, new Date(attendanceDate))
    .input('TimeValue', sql.VarChar(5), timeValue)
    .query(`
      UPDATE dbo.[${tableName}]
      SET [${columns[0]}] = ${timeExpression(columns[0])},
          [${columns[1]}] = ${timeExpression(columns[1])}
      WHERE LTRIM(RTRIM(Empcode)) = @EmpCode
        AND CONVERT(varchar(10), AttDate, 120) = CONVERT(varchar(10), @AttendanceDate, 120);

      SELECT @@ROWCOUNT AS RowsAffected;
    `);

  if (result.recordset[0]?.RowsAffected !== 1) {
    throw new Error('Attendance record was not found for the selected date.');
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