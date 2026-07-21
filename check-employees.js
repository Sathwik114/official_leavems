const sql = require('mssql');

const baseConfig = {
  user: 'paydev',
  password: 'dev.gtipay@123',
  server: '10.40.10.105',
  database: 'Payroll',
  port: 1433,
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
};

async function check() {
  const pool = await new sql.ConnectionPool(baseConfig).connect();
  const ids = ['250479', '140287', '230022'];
  for (const id of ids) {
    const res = await pool.request()
      .input('id', sql.NVarChar, id)
      .query('SELECT EmpCode, EmpName, DeptCode, NSecCode AS Section FROM EmpMast WHERE LTRIM(RTRIM(EmpCode)) = @id');
    console.log(id, res.recordset[0]);
  }
  process.exit(0);
}

check().catch(err => {
  console.error(err);
  process.exit(1);
});
