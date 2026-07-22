const sql = require('mssql');

const nextCfg = {
  user: 'sa',
  password: 'sqlsa@2012',
  server: 'PC20004',
  database: 'NextPractice',
  port: 1433,
  options: { encrypt: false, trustServerCertificate: true },
};

const payrollCfg = {
  user: 'paydev',
  password: 'dev.gtipay@123',
  server: '10.40.10.105',
  database: 'Payroll',
  port: 1433,
  options: { encrypt: false, trustServerCertificate: true },
};

const attCfg = {
  user: 'paydev',
  password: 'dev.gtipay@123',
  server: '10.40.10.105',
  database: 'AttmSystem',
  port: 1433,
  options: { encrypt: false, trustServerCertificate: true },
};

(async () => {
  let nextPool, payrollPool, attPool;
  try {
    nextPool = await sql.connect(nextCfg);
    payrollPool = await new sql.ConnectionPool(payrollCfg).connect();
    attPool = await new sql.ConnectionPool(attCfg).connect();

    const missing = await nextPool.request().query(`
      SELECT TOP 200 Id, empcode, attdate
      FROM dbo.JlyComoof
      WHERE (unitcode IS NULL OR emptype IS NULL OR Deptcode IS NULL OR Nseccode IS NULL OR shift IS NULL OR INTIME IS NULL OR OUTTIME IS NULL)
      ORDER BY Id ASC;
    `);

    if (!missing.recordset.length) {
      console.log('No rows with missing fields found.');
      return process.exit(0);
    }

    for (const row of missing.recordset) {
      const id = row.Id;
      const empcode = String(row.empcode || '').trim();
      const attdate = row.attdate ? new Date(row.attdate) : null;

      if (!empcode) {
        console.log(`Skipping Id ${id} because empcode is missing`);
        continue;
      }

      // Fetch EmpMast
      const empRes = await payrollPool.request()
        .input('empcode', sql.NVarChar, empcode)
        .query(`SELECT TOP 1 EmpCode, EmpName, UnitCode, EmpType, DeptCode, NSecCode, Shift FROM EmpMast WHERE LTRIM(RTRIM(EmpCode)) = @empcode`);

      const emp = empRes.recordset[0] || {};

      // Fetch attendance for that date
      let inTime = null, outTime = null;
      if (attdate) {
        const month = String(attdate.getMonth() + 1).padStart(2, '0');
        const year = attdate.getFullYear();
        const tableName = `CAP${month}${year}`;
        try {
          const attRes = await attPool.request()
            .input('empcode', sql.NVarChar, empcode)
            .input('attDate', sql.DateTime, attdate)
            .query(`SELECT TOP 1 InTime, OutTime FROM ${tableName} WHERE Empcode = @empcode AND CAST(AttDate AS DATE) = CAST(@attDate AS DATE)`);
          const att = attRes.recordset[0] || {};
          inTime = att.InTime || att.INTIME || att.intime || null;
          outTime = att.OutTime || att.OUTTIME || att.outtime || null;
        } catch (attErr) {
          // table may not exist or query failed
          console.warn(`Attendance lookup failed for ${empcode} date ${attdate.toISOString().slice(0,10)}:`, attErr.message);
        }
      }

      const updateReq = nextPool.request()
        .input('Id', sql.Int, id)
        .input('UnitCode', sql.NVarChar, emp.UnitCode || emp.unitcode || null)
        .input('EmpType', sql.NVarChar, emp.EmpType || emp.emptype || null)
        .input('DeptCode', sql.NVarChar, emp.DeptCode || emp.deptcode || null)
        .input('NSecCode', sql.NVarChar, emp.NSecCode || emp.NSecCode || emp.Nseccode || null)
        .input('Shift', sql.NVarChar, emp.Shift || emp.shift || null)
        .input('EmpName', sql.NVarChar, emp.EmpName || emp.empname || null)
        .input('InTime', sql.NVarChar, inTime || null)
        .input('OutTime', sql.NVarChar, outTime || null)
        .input('AbsDays', sql.Decimal(18,3), 0.000);

      const updateSql = `
        UPDATE dbo.JlyComoof
        SET
          unitcode = COALESCE(@UnitCode, unitcode),
          empname = COALESCE(@EmpName, empname),
          emptype = COALESCE(@EmpType, emptype),
          Deptcode = COALESCE(@DeptCode, Deptcode),
          Nseccode = COALESCE(@NSecCode, Nseccode),
          shift = COALESCE(@Shift, shift),
          INTIME = COALESCE(@InTime, INTIME),
          OUTTIME = COALESCE(@OutTime, OUTTIME),
          AbsDays = COALESCE(@AbsDays, AbsDays)
        WHERE Id = @Id;
      `;

      try {
        await updateReq.query(updateSql);
        console.log(`Updated Id ${id} (empcode ${empcode}).`);
      } catch (uErr) {
        console.error(`Failed to update Id ${id}:`, uErr.message);
      }
    }

    console.log('Done processing missing rows.');

  } catch (err) {
    console.error('Fatal error:', err.message);
    process.exit(1);
  } finally {
    try { if (nextPool) await nextPool.close(); } catch (e) {}
    try { if (payrollPool) await payrollPool.close(); } catch (e) {}
    try { if (attPool) await attPool.close(); } catch (e) {}
  }
})();
