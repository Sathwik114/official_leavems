const sql = require('mssql');

const baseConfig = {
  user: 'sa',
  password: 'sqlsa@2012',
  server: 'PC20004',
  port: 1433,
  database: 'nextpractice',
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
};

async function check() {
  const pool = await new sql.ConnectionPool(baseConfig).connect();
  const reqResult = await pool.request().query('SELECT * FROM dbo.LeaveRequests WHERE Id = 29');
  console.log('--- LEAVE REQUEST ---');
  console.log(reqResult.recordset[0]);

  const appResult = await pool.request().query('SELECT * FROM dbo.LeaveApprovals WHERE LeaveRequestId = 29');
  console.log('--- LEAVE APPROVALS ---');
  console.log(appResult.recordset);
  
  process.exit(0);
}

check().catch(err => {
  console.error(err);
  process.exit(1);
});
