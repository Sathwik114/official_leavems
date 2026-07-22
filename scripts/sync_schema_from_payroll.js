/*
Script: sync_schema_from_payroll.js
- Connects to the payroll DB and reads the columns in dbo.EmpMast
- Connects to the leave DB (DATABASE_URL) and for each target table (CLAndELDetl, JlyComoof)
  adds any missing columns (as NVARCHAR(200) NULL) matching the EmpMast column names.

Usage:
  node ./scripts/sync_schema_from_payroll.js

Environment variables expected:
- PAYROLL_DB_USER, PAYROLL_DB_PASSWORD, PAYROLL_DB_SERVER, PAYROLL_DB_NAME, PAYROLL_DB_PORT (optional)
OR
- PAYROLL_DATABASE_URL (sqlserver connection string in the same format used by the app)

- DATABASE_URL (leave DB connection string) must be set (used by prisma and app)
*/

const sql = require('mssql');

function parseConnectionString(url) {
  if (!url) return null;
  const serverPortMatch = url.match(/sqlserver:\/\/([^;:]+)(?::(\d+))?/i);
  if (!serverPortMatch) return null;
  const params = {};
  const queryStr = url.substring(url.indexOf(';') + 1);
  for (const part of queryStr.split(';')) {
    if (!part) continue;
    const eqIndex = part.indexOf('=');
    if (eqIndex === -1) continue;
    const key = part.substring(0, eqIndex).trim();
    const value = part.substring(eqIndex + 1).trim();
    params[key] = value;
  }
  return {
    server: serverPortMatch[1],
    port: serverPortMatch[2] ? parseInt(serverPortMatch[2], 10) : 1433,
    database: params.database || '',
    user: params.user || '',
    password: params.password || '',
    options: {
      encrypt: params.encrypt === 'true',
      trustServerCertificate: params.trustServerCertificate === 'true',
    },
  };
}

async function getPayrollConfig() {
  if (process.env.PAYROLL_DATABASE_URL) return parseConnectionString(process.env.PAYROLL_DATABASE_URL);
  return {
    user: process.env.PAYROLL_DB_USER || 'paydev',
    password: process.env.PAYROLL_DB_PASSWORD || 'paydev',
    server: process.env.PAYROLL_DB_SERVER || '10.40.10.105',
    database: process.env.PAYROLL_DB_NAME || 'Payroll',
    port: process.env.PAYROLL_DB_PORT ? Number(process.env.PAYROLL_DB_PORT) : 1433,
    options: {
      encrypt: false,
      trustServerCertificate: true,
    },
  };
}

async function getLeaveConfig() {
  if (process.env.DATABASE_URL) return parseConnectionString(process.env.DATABASE_URL);
  return {
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || 'sqlsa@2012',
    server: process.env.DB_SERVER || 'PC20004',
    database: process.env.DB_NAME || 'NextPractice',
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 1433,
    options: {
      encrypt: false,
      trustServerCertificate: true,
    },
  };
}

async function main() {
  const payrollCfg = await getPayrollConfig();
  const leaveCfg = await getLeaveConfig();

  console.log('Connecting to payroll DB at', payrollCfg.server, payrollCfg.database);
  const payrollPool = await sql.connect({ ...payrollCfg, pool: { max: 5 } });

  const empColumnsRes = await payrollPool.request().query(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'EmpMast' AND TABLE_SCHEMA = 'dbo'
    ORDER BY ORDINAL_POSITION;
  `);

  const empColumns = (empColumnsRes.recordset || []).map(r => r.COLUMN_NAME).filter(Boolean);
  console.log('Found EmpMast columns:', empColumns.join(', '));

  // Connect to leave DB
  console.log('Connecting to leave DB at', leaveCfg.server, leaveCfg.database);
  const leavePool = await sql.connect({ ...leaveCfg, pool: { max: 5 } });

  const targetTables = ['CLAndELDetl', 'JlyComoof'];

  for (const table of targetTables) {
    const existingColsRes = await leavePool.request().input('table', sql.NVarChar, table).query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @table AND TABLE_SCHEMA = 'dbo'
    `);
    const existingCols = (existingColsRes.recordset || []).map(r => r.COLUMN_NAME.toUpperCase());

    for (const col of empColumns) {
      const colUpper = col.toUpperCase();
      if (existingCols.includes(colUpper)) continue;

      // Add column - default to NVARCHAR(200) NULL
      const safeCol = col.replace(/[^0-9A-Za-z_]/g, '_');
      const alterSql = `ALTER TABLE dbo.${table} ADD [${safeCol}] NVARCHAR(200) NULL;`;
      try {
        console.log(`Adding column ${safeCol} to ${table}`);
        await leavePool.request().query(alterSql);
      } catch (err) {
        console.error(`Failed to add column ${safeCol} to ${table}:`, err && err.message ? err.message : err);
      }
    }
  }

  console.log('Schema sync complete.');
  await payrollPool.close();
  await leavePool.close();
}

main().catch(err => {
  console.error('Error syncing schema from payroll:', err);
  process.exit(1);
});
