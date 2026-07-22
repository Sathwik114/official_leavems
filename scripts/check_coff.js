const sql = require('mssql');
(async ()=>{
  try {
    const cfg = { user: 'sa', password: 'sqlsa@2012', server: 'PC20004', database: 'NextPractice', port: 1433, options: { encrypt: false, trustServerCertificate: true } };
    const pool = await sql.connect(cfg);
    const res = await pool.request().query("SELECT TOP 10 Id, unitcode, empcode, empname, emptype, Deptcode, Nseccode, shift, attdate, atttype1, Atttype, AbsDays, INTIME, OUTTIME, RowId FROM dbo.JlyComoof ORDER BY Id DESC");
    console.log(JSON.stringify(res.recordset, null, 2));
    await pool.close();
  } catch (e) {
    console.error('ERROR', e.message);
    process.exit(1);
  }
})();
