import sql from 'mssql';
import { getEmployeeDetails as getPayrollEmployeeDetails } from './payrollDb';

const DATABASE_NAME = process.env.LEAVE_DB_NAME || 'nextpractice';

const baseConfig = {
  user: 'sa',
  password: 'sqlsa@2012',
  server: 'PC20004',
  port: 1433,
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
};

const poolCache = {};

function createConfig(databaseName = DATABASE_NAME) {
  return {
    ...baseConfig,
    database: databaseName,
  };
}

async function getPool(databaseName = DATABASE_NAME) {
  const key = databaseName || DATABASE_NAME;

  if (!poolCache[key]) {
    try {
      poolCache[key] = new sql.ConnectionPool(createConfig(key)).connect();
    } catch (error) {
      console.error(`Failed to create pool for ${key}:`, error.message);
      delete poolCache[key];
      throw error;
    }
  }

  try {
    return await poolCache[key];
  } catch (error) {
    console.error(`Pool connection error for ${key}:`, error.message);
    delete poolCache[key];
    throw error;
  }
}


async function ensureDatabaseExists() {
  // Database already exists on PC20004, just verify connection
  const testPool = await getPool(DATABASE_NAME);
  return testPool;
}

async function resolveEmployeeInfo(code) {
  if (!code) return null;

  try {
    return await getPayrollEmployeeDetails(String(code).trim());
  } catch (error) {
    console.error(`Failed to resolve employee ${code}:`, error.message);
    return null;
  }
}

async function resolveApproverDisplayNames(value) {
  if (!value) return '';

  const values = String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (values.length === 0) return '';

  const resolved = await Promise.all(
    values.map(async (item) => {
      const employee = await resolveEmployeeInfo(item);
      return employee?.EmpName || item;
    })
  );

  return resolved.join(', ');
}

async function enrichLeaveRequest(request) {
  if (!request) return null;

  const applicantEmployee = await resolveEmployeeInfo(request.ApplicantId);
  const relieverEmployee = request.RelieverId ? await resolveEmployeeInfo(request.RelieverId) : null;
  const currentApproverEmployee = request.CurrentApprover ? await resolveEmployeeInfo(request.CurrentApprover) : null;
  const approvedByNames = request.ApprovedBy ? await resolveApproverDisplayNames(request.ApprovedBy) : '';

  return {
    ...request,
    CurrentApproverId: request.CurrentApprover || '',
    ApplicantName: request.ApplicantName || applicantEmployee?.EmpName || request.ApplicantId || '',
    Department: applicantEmployee?.DeptCode || request.Department || '',
    Section: applicantEmployee?.Section || request.Section || '',
    RelieverName: request.RelieverName || relieverEmployee?.EmpName || request.RelieverId || '',
    CurrentApprover: currentApproverEmployee?.EmpName || request.CurrentApprover || '',
    ApprovedBy: approvedByNames || request.ApprovedBy || '',
  };
}

async function enrichLeaveRequests(requests) {
  if (!Array.isArray(requests)) return [];
  const enriched = await Promise.all(requests.map((request) => enrichLeaveRequest(request)));
  return enriched.filter(Boolean);
}

export async function ensureLeaveTables() {
  await ensureDatabaseExists();
  const pool = await getPool(DATABASE_NAME);

  await pool.request().query(`
    IF OBJECT_ID(N'dbo.LeaveRequests', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.LeaveRequests (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        ApplicantId NVARCHAR(100) NOT NULL,
        ApplicantName NVARCHAR(200) NULL,
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
        Status NVARCHAR(50) NOT NULL DEFAULT 'PENDING',
        CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
        UpdatedAt DATETIME NOT NULL DEFAULT GETDATE()
      );
    END;

    IF COL_LENGTH('dbo.LeaveRequests', 'ApprovedBy') IS NULL
    BEGIN
      ALTER TABLE dbo.LeaveRequests ADD ApprovedBy NVARCHAR(100) NULL;
    END;

    IF COL_LENGTH('dbo.LeaveRequests', 'ApprovedAt') IS NULL
    BEGIN
      ALTER TABLE dbo.LeaveRequests ADD ApprovedAt DATETIME NULL;
    END;

    IF COL_LENGTH('dbo.LeaveRequests', 'AttachmentName') IS NULL
    BEGIN
      ALTER TABLE dbo.LeaveRequests ADD AttachmentName NVARCHAR(255) NULL;
    END;

    IF COL_LENGTH('dbo.LeaveRequests', 'AttachmentType') IS NULL
    BEGIN
      ALTER TABLE dbo.LeaveRequests ADD AttachmentType NVARCHAR(100) NULL;
    END;

    IF COL_LENGTH('dbo.LeaveRequests', 'RejectedBy') IS NULL
    BEGIN
      ALTER TABLE dbo.LeaveRequests ADD RejectedBy NVARCHAR(100) NULL;
    END;

    IF COL_LENGTH('dbo.LeaveRequests', 'RejectionReason') IS NULL
    BEGIN
      ALTER TABLE dbo.LeaveRequests ADD RejectionReason NVARCHAR(MAX) NULL;
    END;

    IF COL_LENGTH('dbo.LeaveRequests', 'RejectedAt') IS NULL
    BEGIN
      ALTER TABLE dbo.LeaveRequests ADD RejectedAt DATETIME NULL;
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
  `);
}

export async function createLeaveRequest(payload) {
  await ensureLeaveTables();
  const pool = await getPool();

  const result = await pool.request()
    .input('ApplicantId', sql.NVarChar, String(payload.applicantId || '').trim())
    .input('ApplicantName', sql.NVarChar, payload.applicantName || '')
    .input('LeaveType', sql.NVarChar, payload.leaveType || 'Earned Leave')
    .input('StartDate', sql.DateTime, payload.startDate)
    .input('EndDate', sql.DateTime, payload.endDate)
    .input('TotalDays', sql.Int, Number(payload.totalDays || 1))
    .input('Reason', sql.NVarChar, payload.reason || '')
    .input('RelieverId', sql.NVarChar, payload.relieverId || null)
    .input('RelieverName', sql.NVarChar, payload.relieverName || null)
    .input('ContactNumber', sql.NVarChar, payload.contactNumber || null)
    .input('AttachmentName', sql.NVarChar, payload.attachmentName || null)
    .input('AttachmentType', sql.NVarChar, payload.attachmentType || null)
    .input('ApprovalFlow', sql.NVarChar, payload.approvalFlow || '')
    .input('CurrentApprover', sql.NVarChar, payload.currentApprover || '')
    .query(`
      INSERT INTO dbo.LeaveRequests (
        ApplicantId,
        ApplicantName,
        LeaveType,
        StartDate,
        EndDate,
        TotalDays,
        Reason,
        RelieverId,
        RelieverName,
        ContactNumber,
        AttachmentName,
        AttachmentType,
        ApprovalFlow,
        CurrentApprover,
        Status,
        UpdatedAt
      )
      VALUES (
        @ApplicantId,
        @ApplicantName,
        @LeaveType,
        @StartDate,
        @EndDate,
        @TotalDays,
        @Reason,
        @RelieverId,
        @RelieverName,
        @ContactNumber,
        @AttachmentName,
        @AttachmentType,
        @ApprovalFlow,
        @CurrentApprover,
        'PENDING',
        GETDATE()
      );
      SELECT * FROM dbo.LeaveRequests WHERE Id = SCOPE_IDENTITY();
    `);

  // return the full inserted row for easier debugging
  return result.recordset[0] || null;
}

export async function addLeaveApproval(leaveRequestId, approverId, decision, remarks, stepNumber) {
  const pool = await getPool();

  await pool.request()
    .input('LeaveRequestId', sql.Int, leaveRequestId)
    .input('ApproverId', sql.NVarChar, approverId)
    .input('Decision', sql.NVarChar, decision || 'PENDING')
    .input('Remarks', sql.NVarChar, remarks || '')
    .input('StepNumber', sql.Int, stepNumber)
    .query(`
      INSERT INTO dbo.LeaveApprovals (LeaveRequestId, ApproverId, Decision, Remarks, StepNumber)
      VALUES (@LeaveRequestId, @ApproverId, @Decision, @Remarks, @StepNumber);
    `);
}

export async function updateLeaveRequestStatus(leaveRequestId, currentApprover, status, approvedBy = null) {
  const pool = await getPool();

  await pool.request()
    .input('LeaveRequestId', sql.Int, leaveRequestId)
    .input('CurrentApprover', sql.NVarChar, currentApprover || '')
    .input('Status', sql.NVarChar, status || 'PENDING')
    .input('ApprovedBy', sql.NVarChar, approvedBy || null)
    .query(`
      UPDATE dbo.LeaveRequests
      SET CurrentApprover = @CurrentApprover,
          Status = @Status,
          ApprovedBy = CASE
            WHEN @ApprovedBy IS NOT NULL AND @ApprovedBy <> '' THEN
              CASE WHEN ApprovedBy IS NULL OR ApprovedBy = '' THEN @ApprovedBy ELSE ApprovedBy + ',' + @ApprovedBy END
            ELSE ApprovedBy
          END,
          ApprovedAt = CASE WHEN @ApprovedBy IS NOT NULL AND @ApprovedBy <> '' AND ApprovedAt IS NULL THEN GETDATE() ELSE ApprovedAt END,
          UpdatedAt = GETDATE()
      WHERE Id = @LeaveRequestId;
    `);
}

export async function updateLeaveRequestRejection(leaveRequestId, rejectedBy, reason) {
  const pool = await getPool();

  await pool.request()
    .input('LeaveRequestId', sql.Int, leaveRequestId)
    .input('RejectedBy', sql.NVarChar, rejectedBy || '')
    .input('RejectionReason', sql.NVarChar, reason || '')
    .query(`
      UPDATE dbo.LeaveRequests
      SET RejectedBy = @RejectedBy,
          RejectionReason = @RejectionReason,
          RejectedAt = CASE WHEN RejectedAt IS NULL THEN GETDATE() ELSE RejectedAt END,
          Status = 'REJECTED',
          CurrentApprover = '',
          UpdatedAt = GETDATE()
      WHERE Id = @LeaveRequestId;
    `);
}

export async function getLeaveRequestById(leaveRequestId) {
  await ensureLeaveTables();
  const pool = await getPool();

  const result = await pool.request()
    .input('LeaveRequestId', sql.Int, leaveRequestId)
    .query(`
      SELECT TOP 1
        Id,
        ApplicantId,
        ApplicantName,
        LeaveType,
        StartDate,
        EndDate,
        TotalDays,
        Reason,
        RelieverId,
        RelieverName,
        ContactNumber,
        AttachmentName,
        AttachmentType,
        ApprovalFlow,
        CurrentApprover,
        ApprovedBy,
        ApprovedAt,
        Status,
        CreatedAt,
        UpdatedAt
      FROM dbo.LeaveRequests
      WHERE Id = @LeaveRequestId;
    `);

  const request = result.recordset[0] || null;
  return request ? enrichLeaveRequest(request) : null;
}

export async function getApprovedRequestsForApprover(approverId) {
  await ensureLeaveTables();
  const pool = await getPool();

  const result = await pool.request()
    .input('ApproverId', sql.NVarChar, String(approverId || '').trim())
    .query(`
      SELECT DISTINCT
        lr.Id,
        lr.ApplicantId,
        lr.ApplicantName,
        lr.LeaveType,
        lr.StartDate,
        lr.EndDate,
        lr.TotalDays,
        lr.Reason,
        lr.AttachmentName,
        lr.AttachmentType,
        lr.ApprovalFlow,
        lr.CurrentApprover,
        lr.ApprovedBy,
        lr.ApprovedAt,
        lr.Status,
        lr.CreatedAt,
        la.CreatedAt AS ApprovalCreatedAt
      FROM dbo.LeaveRequests lr
      INNER JOIN dbo.LeaveApprovals la ON la.LeaveRequestId = lr.Id
      WHERE la.ApproverId = @ApproverId AND la.Decision = 'APPROVED'
      ORDER BY la.CreatedAt DESC;
    `);

  const requests = result.recordset || [];
  return enrichLeaveRequests(requests);
}

export async function getPendingApprovalsForUser(currentUserUsername) {
  await ensureLeaveTables();
  const pool = await getPool();

  const result = await pool.request()
    .input('CurrentApprover', sql.NVarChar, String(currentUserUsername || '').trim())
    .query(`
      SELECT
        Id,
        ApplicantId,
        ApplicantName,
        LeaveType,
        StartDate,
        EndDate,
        TotalDays,
        Reason,
        AttachmentName,
        AttachmentType,
        ApprovalFlow,
        CurrentApprover,
        Status,
        ApprovedBy,
        ApprovedAt,
        CreatedAt
      FROM dbo.LeaveRequests
      WHERE Status = 'PENDING' AND CurrentApprover = @CurrentApprover
      ORDER BY CreatedAt DESC;
    `);

  const requests = result.recordset || [];
  return enrichLeaveRequests(requests);
}

export async function getLeaveRequestsForApplicant(applicantId) {
  await ensureLeaveTables();
  const pool = await getPool();

  const result = await pool.request()
    .input('ApplicantId', sql.NVarChar, String(applicantId || '').trim())
    .query(`
      SELECT
        Id,
        ApplicantId,
        ApplicantName,
        LeaveType,
        StartDate,
        EndDate,
        TotalDays,
        Reason,
        AttachmentName,
        AttachmentType,
        ApprovalFlow,
        CurrentApprover,
        ApprovedBy,
        ApprovedAt,
        Status,
        CreatedAt
      FROM dbo.LeaveRequests
      WHERE ApplicantId = @ApplicantId
      ORDER BY CreatedAt DESC;
    `);

  const requests = result.recordset || [];
  return enrichLeaveRequests(requests);
}

export async function getAllLeaveRequests() {
  await ensureLeaveTables();
  const pool = await getPool();

  const result = await pool.request()
    .query(`
      SELECT
        Id,
        ApplicantId,
        ApplicantName,
        LeaveType,
        StartDate,
        EndDate,
        TotalDays,
        Reason,
        AttachmentName,
        AttachmentType,
        ApprovalFlow,
        CurrentApprover,
        ApprovedBy,
        ApprovedAt,
        Status,
        CreatedAt,
        UpdatedAt
      FROM dbo.LeaveRequests
      ORDER BY CreatedAt DESC;
    `);

  const requests = result.recordset || [];
  return enrichLeaveRequests(requests);
}

export async function getAllLeaveApprovals() {
  await ensureLeaveTables();
  const pool = await getPool();

  const result = await pool.request()
    .query(`
      SELECT Id, LeaveRequestId, ApproverId, Decision, Remarks, StepNumber, CreatedAt
      FROM dbo.LeaveApprovals
      ORDER BY CreatedAt DESC;
    `);

  return result.recordset || [];
}
