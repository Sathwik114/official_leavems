const sql = require('mssql');
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });

const config = {
  user: 'sa',
  password: 'sqlsa@2012',
  server: process.env.DATABASE_SERVER || 'PC20004',
  port: Number(process.env.DATABASE_PORT || 1433),
  database: process.env.LEAVE_DB_NAME || 'OfficialLeave',
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
  pool: { max: 5 }
};

(async () => {
  try {
    const pool = await sql.ConnectionPool(config).connect();
    const res = await pool.request().query('SELECT TOP 10 Id, ApplicantId, LeaveType, StartDate, EndDate, TotalDays, Status, CreatedAt FROM dbo.LeaveRequests ORDER BY Id DESC');
    console.log('Rows:', res.recordset.length);
    console.dir(res.recordset, { depth: null });
    await pool.close();
  } catch (err) {
    console.error('DB check failed:', err.message || err);
    process.exit(1);
  }
})();
