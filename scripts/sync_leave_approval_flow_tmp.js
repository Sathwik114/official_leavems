const sql = require('mssql');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

function parseConnectionString(value) {
  const match = String(value || '').match(/^sqlserver:\/\/([^;:/]+)(?::(\d+))?/i);
  const parts = Object.fromEntries(
    String(value || '')
      .slice(String(value || '').indexOf(';') + 1)
      .split(';')
      .filter(Boolean)
      .map((part) => part.split(/=(.*)/s))
      .map(([key, item]) => [key.trim().toLowerCase(), (item || '').trim()])
  );

  return {
    server: match?.[1],
    port: Number(match?.[2] || 1433),
    database: parts.database,
    user: parts.user,
    password: parts.password,
    options: {
      encrypt: parts.encrypt === 'true',
      trustServerCertificate: parts.trustservercertificate !== 'false',
    },
  };
}

const rows = [
  ['101024', 'mf', '250479', '140287'],
  ['101027', 'mf', '250479', '140287'],
  ['101049', 'mf', '250479', '140287'],
  ['150121', 'mf', '250479', '140287'],
  ['180272', 'mf', '250479', '140287'],
  ['230022', 'mf', '250479', '140287'],
  ['120124', 'adm', '250479', '140287'],
  ['120137', 'adm', '250479', '140287'],
  ['111254', 'adm', '250479', '140287'],
  ['111075', 'adm', '250479', '140287'],
  ['170228', 'adm', '250479', '140287'],
  ['220341', 'adm', '250479', '140287'],
  ['220579', 'adm', '250479', '140287'],
  ['260296', 'adm', '250479', '140287'],
  ['111137', 'vip', '111137', '140287'],
  ['210231', 'vip', '210231', '140287'],
  ['111069', 'vip', '111069', '140287'],
  ['100209', 'vip', '100209', '140287'],
  ['140287', 'special[ccc]', '140287', null],
  ['111233', 'hr', '111233', null],
];

(async () => {
  const pool = await sql.connect(parseConnectionString(process.env.DATABASE_URL));
  const columns = await pool.request().query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'LeaveApprovalFlow' ORDER BY ORDINAL_POSITION");
  console.log('Columns:', columns.recordset.map((row) => row.COLUMN_NAME).join(', '));

  const existing = await pool.request().query('SELECT EmpCode, EmpCategory, VicePresident, President FROM dbo.LeaveApprovalFlow ORDER BY EmpCode');
  console.log('Existing rows:', existing.recordset);

  for (const [empCode, category, vicePresident, president] of rows) {
    await pool.request()
      .input('EmpCode', sql.NVarChar, empCode)
      .input('EmpCategory', sql.NVarChar, category)
      .input('VicePresident', sql.NVarChar, vicePresident)
      .input('President', sql.NVarChar, president)
      .query(`
        UPDATE dbo.LeaveApprovalFlow
        SET EmpCategory = @EmpCategory,
            VicePresident = @VicePresident,
            President = @President
        WHERE LTRIM(RTRIM(EmpCode)) = @EmpCode;

        IF @@ROWCOUNT = 0
        BEGIN
          INSERT INTO dbo.LeaveApprovalFlow (EmpCode, EmpCategory, VicePresident, President)
          VALUES (@EmpCode, @EmpCategory, @VicePresident, @President);
        END;
      `);
  }

  const result = await pool.request().query('SELECT EmpCode, EmpCategory, VicePresident, President FROM dbo.LeaveApprovalFlow ORDER BY EmpCode');
  console.log('Final rows:', result.recordset);
  await pool.close();
})().catch((error) => {
  console.error('Sync failed:', error.message);
  process.exit(1);
});
