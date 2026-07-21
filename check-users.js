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
  const res = await pool.request().query('SELECT * FROM dbo.[User]');
  console.log('--- USERS ---');
  console.log(res.recordset);
  process.exit(0);
}

check().catch(err => {
  console.error(err);
  process.exit(1);
});
