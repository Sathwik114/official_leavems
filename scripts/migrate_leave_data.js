/*
 * Copies leave records from LEGACY_LEAVE_DATABASE_URL to DATABASE_URL.
 * Run once: node scripts/migrate_leave_data.js
 */
require('dotenv').config();
const sql = require('mssql');

function connectionConfig(connectionString, label) {
  if (!connectionString) {
    throw new Error(`${label} is not configured.`);
  }

  const match = connectionString.match(/^sqlserver:\/\/([^;:/]+)(?::(\d+))?/i);
  if (!match) {
    throw new Error(`${label} is not a valid SQL Server connection string.`);
  }

  const values = Object.fromEntries(
    connectionString
      .slice(connectionString.indexOf(';') + 1)
      .split(';')
      .filter(Boolean)
      .map((part) => part.split(/=(.*)/s))
      .map(([key, value]) => [key.trim().toLowerCase(), (value || '').trim()])
  );

  return {
    user: values.user,
    password: values.password,
    server: match[1],
    port: Number(match[2] || 1433),
    database: values.database,
    options: {
      encrypt: values.encrypt === 'true',
      trustServerCertificate: values.trustservercertificate !== 'false',
    },
  };
}

async function ensureDestinationTables(pool) {
  await pool.request().query(`
    IF OBJECT_ID(N'dbo.LeaveRequests', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.LeaveRequests (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        ApplicantId NVARCHAR(100) NOT NULL,
        ApplicantName NVARCHAR(200) NULL,
        Department NVARCHAR(100) NULL,
        Section NVARCHAR(100) NULL,
        Shift NVARCHAR(100) NULL,
        EmpType NVARCHAR(100) NULL,
        LeaveType NVARCHAR(100) NOT NULL,
        StartDate DATETIME NOT NULL,
        EndDate DATETIME NOT NULL,
        TotalDays INT NOT NULL,
        Reason NVARCHAR(MAX) NOT NULL,
        RelieverId NVARCHAR(100) NULL,
        RelieverName NVARCHAR(200) NULL,
        ContactNumber NVARCHAR(100) NULL,
        AttachmentName NVARCHAR(255) NULL,
        AttachmentType NVARCHAR(100) NULL,
        ApprovalFlow NVARCHAR(500) NOT NULL,
        CurrentApprover NVARCHAR(100) NOT NULL,
        ApprovedBy NVARCHAR(100) NULL,
        ApprovedAt DATETIME NULL,
        RejectedBy NVARCHAR(100) NULL,
        RejectionReason NVARCHAR(MAX) NULL,
        RejectedAt DATETIME NULL,
        Status NVARCHAR(50) NOT NULL DEFAULT 'PENDING',
        CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
        UpdatedAt DATETIME NOT NULL DEFAULT GETDATE()
      );
    END;

    IF OBJECT_ID(N'dbo.LeaveApprovals', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.LeaveApprovals (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        LeaveRequestId INT NOT NULL,
        ApproverId NVARCHAR(100) NOT NULL,
        Decision NVARCHAR(50) NULL,
        Remarks NVARCHAR(MAX) NULL,
        StepNumber INT NOT NULL,
        CreatedAt DATETIME NOT NULL DEFAULT GETDATE()
      );
    END;

    IF COL_LENGTH('dbo.LeaveRequests', 'Department') IS NULL
      ALTER TABLE dbo.LeaveRequests ADD Department NVARCHAR(100) NULL;
    IF COL_LENGTH('dbo.LeaveRequests', 'Section') IS NULL
      ALTER TABLE dbo.LeaveRequests ADD Section NVARCHAR(100) NULL;
    IF COL_LENGTH('dbo.LeaveRequests', 'Shift') IS NULL
      ALTER TABLE dbo.LeaveRequests ADD Shift NVARCHAR(100) NULL;
    IF COL_LENGTH('dbo.LeaveRequests', 'EmpType') IS NULL
      ALTER TABLE dbo.LeaveRequests ADD EmpType NVARCHAR(100) NULL;

    IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'LeaveRequests' AND COLUMN_NAME = 'ApplicantId' AND DATA_TYPE <> 'nvarchar')
      ALTER TABLE dbo.LeaveRequests ALTER COLUMN ApplicantId NVARCHAR(100) NOT NULL;
    IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'LeaveRequests' AND COLUMN_NAME = 'RelieverId' AND DATA_TYPE <> 'nvarchar')
      ALTER TABLE dbo.LeaveRequests ALTER COLUMN RelieverId NVARCHAR(100) NULL;
    IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'LeaveRequests' AND COLUMN_NAME = 'CurrentApprover' AND DATA_TYPE <> 'nvarchar')
      ALTER TABLE dbo.LeaveRequests ALTER COLUMN CurrentApprover NVARCHAR(100) NOT NULL;
    IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'LeaveRequests' AND COLUMN_NAME = 'ApprovedBy' AND DATA_TYPE <> 'nvarchar')
      ALTER TABLE dbo.LeaveRequests ALTER COLUMN ApprovedBy NVARCHAR(100) NULL;
    IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'LeaveRequests' AND COLUMN_NAME = 'RejectedBy' AND DATA_TYPE <> 'nvarchar')
      ALTER TABLE dbo.LeaveRequests ALTER COLUMN RejectedBy NVARCHAR(100) NULL;
    IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'LeaveApprovals' AND COLUMN_NAME = 'ApproverId' AND DATA_TYPE <> 'nvarchar')
      ALTER TABLE dbo.LeaveApprovals ALTER COLUMN ApproverId NVARCHAR(100) NOT NULL;
  `);
}

async function main() {
  const source = await new sql.ConnectionPool(connectionConfig(process.env.LEGACY_LEAVE_DATABASE_URL, 'LEGACY_LEAVE_DATABASE_URL')).connect();
  const destination = await new sql.ConnectionPool(connectionConfig(process.env.DATABASE_URL, 'DATABASE_URL')).connect();

  try {
    await ensureDestinationTables(destination);

    const legacyRequests = (await source.request().query('SELECT * FROM dbo.LeaveRequests ORDER BY Id')).recordset;
    const legacyApprovals = (await source.request().query('SELECT * FROM dbo.LeaveApprovals ORDER BY Id')).recordset;
    const idMap = new Map();

    for (const item of legacyRequests) {
      const existing = await destination.request()
        .input('ApplicantId', sql.NVarChar, item.ApplicantId)
        .input('LeaveType', sql.NVarChar, item.LeaveType)
        .input('StartDate', sql.DateTime, item.StartDate)
        .input('EndDate', sql.DateTime, item.EndDate)
        .input('Reason', sql.NVarChar(sql.MAX), item.Reason)
        .input('CreatedAt', sql.DateTime, item.CreatedAt)
        .query(`
          SELECT TOP 1 Id FROM dbo.LeaveRequests
          WHERE ApplicantId = @ApplicantId AND LeaveType = @LeaveType
            AND StartDate = @StartDate AND EndDate = @EndDate
            AND Reason = @Reason AND CreatedAt = @CreatedAt;
        `);

      if (existing.recordset[0]) {
        idMap.set(item.Id, existing.recordset[0].Id);
        continue;
      }

      let inserted;
      try {
        inserted = await destination.request()
        .input('ApplicantId', sql.NVarChar, item.ApplicantId)
        .input('ApplicantName', sql.NVarChar, item.ApplicantName)
        .input('LeaveType', sql.NVarChar, item.LeaveType)
        .input('StartDate', sql.DateTime, item.StartDate)
        .input('EndDate', sql.DateTime, item.EndDate)
        .input('TotalDays', sql.Int, item.TotalDays)
        .input('Reason', sql.NVarChar(sql.MAX), item.Reason)
        .input('RelieverId', sql.NVarChar, item.RelieverId)
        .input('RelieverName', sql.NVarChar, item.RelieverName)
        .input('ContactNumber', sql.NVarChar, item.ContactNumber)
        .input('AttachmentName', sql.NVarChar, item.AttachmentName)
        .input('AttachmentType', sql.NVarChar, item.AttachmentType)
        .input('ApprovalFlow', sql.NVarChar, item.ApprovalFlow)
        .input('CurrentApprover', sql.NVarChar, item.CurrentApprover)
        .input('ApprovedBy', sql.NVarChar, item.ApprovedBy)
        .input('ApprovedAt', sql.DateTime, item.ApprovedAt)
        .input('RejectedBy', sql.NVarChar, item.RejectedBy)
        .input('RejectionReason', sql.NVarChar(sql.MAX), item.RejectionReason)
        .input('RejectedAt', sql.DateTime, item.RejectedAt)
        .input('Status', sql.NVarChar, item.Status)
        .input('CreatedAt', sql.DateTime, item.CreatedAt)
        .input('UpdatedAt', sql.DateTime, item.UpdatedAt)
        .query(`
          INSERT INTO dbo.LeaveRequests (
            ApplicantId, ApplicantName, LeaveType, StartDate, EndDate, TotalDays, Reason,
            RelieverId, RelieverName, ContactNumber, AttachmentName, AttachmentType,
            ApprovalFlow, CurrentApprover, ApprovedBy, ApprovedAt, RejectedBy,
            RejectionReason, RejectedAt, Status, CreatedAt, UpdatedAt
          )
          OUTPUT INSERTED.Id
          VALUES (
            @ApplicantId, @ApplicantName, @LeaveType, @StartDate, @EndDate, @TotalDays, @Reason,
            @RelieverId, @RelieverName, @ContactNumber, @AttachmentName, @AttachmentType,
            @ApprovalFlow, @CurrentApprover, @ApprovedBy, @ApprovedAt, @RejectedBy,
            @RejectionReason, @RejectedAt, @Status, @CreatedAt, @UpdatedAt
          );
        `);
      } catch (error) {
        throw new Error(`Could not migrate legacy leave request #${item.Id}: ${error.message}`);
      }

      idMap.set(item.Id, inserted.recordset[0].Id);
    }

    for (const item of legacyApprovals) {
      const leaveRequestId = idMap.get(item.LeaveRequestId);
      if (!leaveRequestId) continue;

      const duplicate = await destination.request()
        .input('LeaveRequestId', sql.Int, leaveRequestId)
        .input('ApproverId', sql.NVarChar, item.ApproverId)
        .input('StepNumber', sql.Int, item.StepNumber)
        .input('Decision', sql.NVarChar, item.Decision)
        .query(`
          SELECT TOP 1 Id FROM dbo.LeaveApprovals
          WHERE LeaveRequestId = @LeaveRequestId AND ApproverId = @ApproverId
            AND StepNumber = @StepNumber AND (Decision = @Decision OR (Decision IS NULL AND @Decision IS NULL));
        `);

      if (duplicate.recordset[0]) continue;

      await destination.request()
        .input('LeaveRequestId', sql.Int, leaveRequestId)
        .input('ApproverId', sql.NVarChar, item.ApproverId)
        .input('Decision', sql.NVarChar, item.Decision)
        .input('Remarks', sql.NVarChar(sql.MAX), item.Remarks)
        .input('StepNumber', sql.Int, item.StepNumber)
        .input('CreatedAt', sql.DateTime, item.CreatedAt)
        .query(`
          INSERT INTO dbo.LeaveApprovals (LeaveRequestId, ApproverId, Decision, Remarks, StepNumber, CreatedAt)
          VALUES (@LeaveRequestId, @ApproverId, @Decision, @Remarks, @StepNumber, @CreatedAt);
        `);
    }

    const destinationCounts = await destination.request().query(`
      SELECT
        (SELECT COUNT(*) FROM dbo.LeaveRequests) AS LeaveRequests,
        (SELECT COUNT(*) FROM dbo.LeaveApprovals) AS LeaveApprovals;
    `);
    const counts = destinationCounts.recordset[0];
    console.log(`Migration complete: ${legacyRequests.length} leave requests and ${legacyApprovals.length} approvals processed. Destination now has ${counts.LeaveRequests} leave requests and ${counts.LeaveApprovals} approvals.`);
  } finally {
    await source.close();
    await destination.close();
  }
}

main().catch((error) => {
  console.error('Leave-data migration failed:', error.message);
  process.exitCode = 1;
});
