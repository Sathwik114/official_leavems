import sql from 'mssql';
import { getEmployeeDetails as getPayrollEmployeeDetails, deductLeaveBalance} from './payrollDb';
import { getAttendanceTimesForDate, getMorningLateByForDate } from './attendanceDb';

function parseSqlServerConnectionString(connectionString) {
  if (!connectionString) return null;

  const match = connectionString.match(/^sqlserver:\/\/([^;:/]+)(?::(\d+))?/i);
  if (!match) return null;

  const values = Object.fromEntries(
    connectionString
      .slice(connectionString.indexOf(';') + 1)
      .split(';')
      .filter(Boolean)
      .map((part) => part.split(/=(.*)/s))
      .filter(([key]) => key)
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

const connectionStringConfig = parseSqlServerConnectionString(process.env.DATABASE_URL);
const DATABASE_NAME = process.env.LEAVE_DB_NAME || connectionStringConfig?.database || 'OfficialLeave';

const baseConfig = connectionStringConfig || {
  user: process.env.LEAVE_DB_USER || process.env.DB_USER || 'sa',
  password: process.env.LEAVE_DB_PASSWORD || process.env.DB_PASSWORD || '',
  server: process.env.LEAVE_DB_SERVER || process.env.DB_SERVER || 'PC20004',
  port: Number(process.env.LEAVE_DB_PORT || process.env.DB_PORT || 1433),
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
};

const poolCache = {};

// Historical records do not always have LeaveRequests.ApprovedBy populated.
// Derive it from the approval history when the summary field is empty.
const approvedBySql = `
  COALESCE(
    NULLIF(lr.ApprovedBy, ''),
    NULLIF(
      STUFF((
        SELECT ',' + CAST(la.ApproverId AS NVARCHAR(100))
        FROM dbo.LeaveApprovals la
        WHERE la.LeaveRequestId = lr.Id AND la.Decision = 'APPROVED'
        ORDER BY la.StepNumber, la.Id
        FOR XML PATH(''), TYPE
      ).value('.', 'NVARCHAR(MAX)'), 1, 1, ''),
      ''
    )
  )
`;

// Maps a submitted leave type (including half-day variants like 'EL/P', 'P/EL')
// to whether it draws against EL or SL balance. LWP/COFF/OD/etc. return null.
function resolveBalanceKind(leaveType) {
  const normalized = String(leaveType || '').toUpperCase();
  if (normalized.includes('EL')) return 'EL';
  if (normalized.includes('SL')) return 'SL';
  return null;
}

// TranId = ApplicantId + DDMMYYYY of submission date, stored as BIGINT.
// e.g. applicantId '260296' submitted on 09-07-2026 -> 26029609072026
function generateTranId(applicantId) {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = String(now.getFullYear());
  const cleanApplicantId = String(applicantId || '').trim();
  return `${cleanApplicantId}${day}${month}${year}`;
}

// Builds a Date that, after the mssql driver converts it to UTC internally,
// lands back on the correct local wall-clock time in SQL Server's DATETIME
// column (which has no timezone of its own) — truncated to HH:MM:00.
function nowAsLocalDateTimeTruncated() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  local.setSeconds(0, 0);
  return local;
}

function createConfig(databaseName = DATABASE_NAME) {
  return {
    ...baseConfig,
    database: databaseName,
  };
}

export async function getPool(databaseName = DATABASE_NAME) {
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
    Department: request.Department || applicantEmployee?.DeptCode || '',
    Section: request.Section || applicantEmployee?.Section || '',
    Shift: applicantEmployee?.Shift || request.Shift || '',
    EmpType: applicantEmployee?.EmpType || request.EmpType || '',
    RelieverName: request.RelieverName || relieverEmployee?.EmpName || request.RelieverId || '',
    CurrentApprover: currentApproverEmployee?.EmpName || request.CurrentApprover || '',
    ApprovedBy: approvedByNames || request.ApprovedBy || '',
    EarnLeaveBalance: applicantEmployee?.EarnLeaveBalance ?? 0,
    SickLeaveBalance: applicantEmployee?.SickLeaveBalance ?? 0,
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
        Department NVARCHAR(100) NULL,
        Section NVARCHAR(100) NULL,
        Shift NVARCHAR(100) NULL,
        EmpType NVARCHAR(100) NULL,
        LeaveType NVARCHAR(100) NOT NULL,
        StartDate DATETIME NOT NULL,
        EndDate DATETIME NOT NULL,
        FromTime NVARCHAR(20) NULL,
        ToTime NVARCHAR(20) NULL,
        CAPINTIME NVARCHAR(100) NULL,
        CAPOUTTIME NVARCHAR(100) NULL,
        MorningLateBy DECIMAL(18,3) NULL,
        TotalDays DECIMAL(5,2) NOT NULL,
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
        HodApproval NVARCHAR(100) NULL,
        HodStatus NVARCHAR(50) NULL,
        HodRejectId NVARCHAR(100) NULL,
        HodRejectReason NVARCHAR(MAX) NULL,
        CccApproval NVARCHAR(100) NULL,
        CccStatus NVARCHAR(50) NULL,
        CccRejectId NVARCHAR(100) NULL,
        CccRejectReason NVARCHAR(MAX) NULL,
        HrApproval NVARCHAR(100) NULL,
        HrStatus NVARCHAR(50) NULL,
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

    IF COL_LENGTH('dbo.LeaveRequests', 'FromTime') IS NULL
      ALTER TABLE dbo.LeaveRequests ADD FromTime NVARCHAR(20) NULL;
    IF COL_LENGTH('dbo.LeaveRequests', 'ToTime') IS NULL
      ALTER TABLE dbo.LeaveRequests ADD ToTime NVARCHAR(20) NULL;
    IF COL_LENGTH('dbo.LeaveRequests', 'CAPINTIME') IS NULL
      ALTER TABLE dbo.LeaveRequests ADD CAPINTIME NVARCHAR(100) NULL;
    IF COL_LENGTH('dbo.LeaveRequests', 'CAPOUTTIME') IS NULL
      ALTER TABLE dbo.LeaveRequests ADD CAPOUTTIME NVARCHAR(100) NULL;
    IF COL_LENGTH('dbo.LeaveRequests', 'MorningLateBy') IS NULL
      ALTER TABLE dbo.LeaveRequests ADD MorningLateBy DECIMAL(18,3) NULL;
    IF COL_LENGTH('dbo.LeaveRequests', 'HodApproval') IS NULL
      ALTER TABLE dbo.LeaveRequests ADD HodApproval NVARCHAR(100) NULL;
    IF COL_LENGTH('dbo.LeaveRequests', 'HodStatus') IS NULL
      ALTER TABLE dbo.LeaveRequests ADD HodStatus NVARCHAR(50) NULL;
    IF COL_LENGTH('dbo.LeaveRequests', 'HodRejectId') IS NULL
      ALTER TABLE dbo.LeaveRequests ADD HodRejectId NVARCHAR(100) NULL;
    IF COL_LENGTH('dbo.LeaveRequests', 'HodRejectReason') IS NULL
      ALTER TABLE dbo.LeaveRequests ADD HodRejectReason NVARCHAR(MAX) NULL;
    IF COL_LENGTH('dbo.LeaveRequests', 'CccApproval') IS NULL
      ALTER TABLE dbo.LeaveRequests ADD CccApproval NVARCHAR(100) NULL;
    IF COL_LENGTH('dbo.LeaveRequests', 'CccStatus') IS NULL
      ALTER TABLE dbo.LeaveRequests ADD CccStatus NVARCHAR(50) NULL;
    IF COL_LENGTH('dbo.LeaveRequests', 'CccRejectId') IS NULL
      ALTER TABLE dbo.LeaveRequests ADD CccRejectId NVARCHAR(100) NULL;
    IF COL_LENGTH('dbo.LeaveRequests', 'CccRejectReason') IS NULL
      ALTER TABLE dbo.LeaveRequests ADD CccRejectReason NVARCHAR(MAX) NULL;
    IF COL_LENGTH('dbo.LeaveRequests', 'HrApproval') IS NULL
      ALTER TABLE dbo.LeaveRequests ADD HrApproval NVARCHAR(100) NULL;
    IF COL_LENGTH('dbo.LeaveRequests', 'HrStatus') IS NULL
      ALTER TABLE dbo.LeaveRequests ADD HrStatus NVARCHAR(50) NULL;

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

    IF COL_LENGTH('dbo.LeaveRequests', 'Department') IS NULL
      ALTER TABLE dbo.LeaveRequests ADD Department NVARCHAR(100) NULL;
    IF COL_LENGTH('dbo.LeaveRequests', 'Section') IS NULL
      ALTER TABLE dbo.LeaveRequests ADD Section NVARCHAR(100) NULL;
    IF COL_LENGTH('dbo.LeaveRequests', 'Shift') IS NULL
      ALTER TABLE dbo.LeaveRequests ADD Shift NVARCHAR(100) NULL;
    IF COL_LENGTH('dbo.LeaveRequests', 'EmpType') IS NULL
      ALTER TABLE dbo.LeaveRequests ADD EmpType NVARCHAR(100) NULL;

    IF COL_LENGTH('dbo.LeaveRequests', 'TranId') IS NULL
      ALTER TABLE dbo.LeaveRequests ADD TranId BIGINT NULL;
    IF COL_LENGTH('dbo.LeaveRequests', 'TranDate') IS NULL
      ALTER TABLE dbo.LeaveRequests ADD TranDate DATETIME NULL;

    -- TotalDays must support half-days (0.5). Older deployments created it as INT,
    -- which silently rounds/truncates half-day leave requests.
    IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'LeaveRequests' AND COLUMN_NAME = 'TotalDays' AND DATA_TYPE <> 'decimal')
      ALTER TABLE dbo.LeaveRequests ALTER COLUMN TotalDays DECIMAL(5,2) NOT NULL;

    -- Workflow values can contain employee IDs and comma-separated approver IDs.
    -- Older deployments created these columns as INT, which prevents saves.
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

    IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'LeaveApprovals' AND COLUMN_NAME = 'ApproverId' AND DATA_TYPE <> 'nvarchar')
      ALTER TABLE dbo.LeaveApprovals ALTER COLUMN ApproverId NVARCHAR(100) NOT NULL;

    IF OBJECT_ID(N'dbo.AllLeaveRequests', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.AllLeaveRequests (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        LeaveRequestId INT NOT NULL UNIQUE,
        ApplicantId NVARCHAR(100) NOT NULL,
        ApplicantName NVARCHAR(200) NULL,
        Department NVARCHAR(100) NULL,
        Section NVARCHAR(100) NULL,
        Shift NVARCHAR(100) NULL,
        EmpType NVARCHAR(100) NULL,
        LeaveType NVARCHAR(100) NOT NULL,
        StartDate DATETIME NOT NULL,
        EndDate DATETIME NOT NULL,
        FromTime NVARCHAR(20) NULL,
        ToTime NVARCHAR(20) NULL,
        CAPINTIME NVARCHAR(100) NULL,
        CAPOUTTIME NVARCHAR(100) NULL,
        MorningLateBy DECIMAL(18,3) NULL,
        TotalDays DECIMAL(5,2) NOT NULL,
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
        HodApproval NVARCHAR(100) NULL,
        HodStatus NVARCHAR(50) NULL,
        CccApproval NVARCHAR(100) NULL,
        CccStatus NVARCHAR(50) NULL,
        CccRejectId NVARCHAR(100) NULL,
        CccRejectReason NVARCHAR(MAX) NULL,
        HrApproval NVARCHAR(100) NULL,
        HrStatus NVARCHAR(50) NULL,
        Status NVARCHAR(50) NOT NULL DEFAULT 'PENDING',
        CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
        UpdatedAt DATETIME NOT NULL DEFAULT GETDATE(),
        TranId BIGINT NULL,
        TranDate DATETIME NULL
      );
    END;
  `);
}

async function syncAcceptedLeaveRequestToArchive(leaveRequestId) {
  if (!leaveRequestId) return;

  const pool = await getPool();
  await pool.request()
    .input('LeaveRequestId', sql.Int, leaveRequestId)
    .query(`
      IF NOT EXISTS (
        SELECT 1
        FROM dbo.AllLeaveRequests
        WHERE LeaveRequestId = @LeaveRequestId
      )
      BEGIN
        INSERT INTO dbo.AllLeaveRequests (
          LeaveRequestId,
          ApplicantId,
          ApplicantName,
          Department,
          Section,
          Shift,
          EmpType,
          LeaveType,
          StartDate,
          EndDate,
          FromTime,
          ToTime,
          CAPINTIME,
          CAPOUTTIME,
          MorningLateBy,
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
          HodApproval,
          HodStatus,
          CccApproval,
          CccStatus,
          CccRejectId,
          CccRejectReason,
          HrApproval,
          HrStatus,
          Status,
          CreatedAt,
          UpdatedAt,
          TranId,
          TranDate
        )
        SELECT
          Id,
          ApplicantId,
          ApplicantName,
          Department,
          Section,
          Shift,
          EmpType,
          LeaveType,
          StartDate,
          EndDate,
          FromTime,
          ToTime,
          CAPINTIME,
          CAPOUTTIME,
          MorningLateBy,
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
          HodApproval,
          HodStatus,
          CccApproval,
          CccStatus,
          CccRejectId,
          CccRejectReason,
          HrApproval,
          HrStatus,
          Status,
          COALESCE(CreatedAt, GETDATE()),
          COALESCE(UpdatedAt, GETDATE()),
          TranId,
          TranDate
        FROM dbo.LeaveRequests
        WHERE Id = @LeaveRequestId
          AND LOWER(COALESCE(CccStatus, '')) = 'accept';
      END;
    `);
}

export async function createLeaveRequest(payload) {
  await ensureLeaveTables();
  const pool = await getPool();
  const payrollEmployee = await getPayrollEmployeeDetails(payload.applicantId).catch(() => null);

  // Only pull CAP In/Out time from AttmSystem when the leave type is COFF
  const attendanceTimes = payload.leaveType === 'COFF'
    ? await getAttendanceTimesForDate(payload.applicantId, payload.startDate).catch(() => ({ CapInTime: null, CapOutTime: null }))
    : { CapInTime: null, CapOutTime: null };

  const requestedDays = Number(payload.totalDays || 1);
  const balanceKind = resolveBalanceKind(payload.leaveType);

  if (balanceKind === 'EL') {
    const availableEl = Number(payrollEmployee?.EarnLeaveBalance ?? 0);
    if (requestedDays > availableEl) {
      throw new Error(`Insufficient EL balance. Available: ${availableEl.toFixed(2)}, Requested: ${requestedDays.toFixed(2)}.`);
    }
  }

  if (balanceKind === 'SL') {
    const availableSl = Number(payrollEmployee?.SickLeaveBalance ?? 0);
    if (requestedDays > availableSl) {
      throw new Error(`Insufficient SL balance. Available: ${availableSl.toFixed(2)}, Requested: ${requestedDays.toFixed(2)}.`);
    }
  }

  const tranId = generateTranId(payload.applicantId);
  const tranDate = nowAsLocalDateTimeTruncated();
  const morningLateBy = String(payload.leaveType || '').replace(/\s/g, '').toLowerCase() === '1hour'
    ? await getMorningLateByForDate(payload.applicantId, payload.startDate).catch(() => null)
    : null;

  const result = await pool.request()
    .input('ApplicantId', sql.NVarChar, String(payload.applicantId || '').trim())
    .input('ApplicantName', sql.NVarChar, payload.applicantName || '')
    .input('Department', sql.NVarChar, payload.department || payrollEmployee?.DeptCode || '')
    .input('Section', sql.NVarChar, payload.section || payrollEmployee?.Section || '')
    .input('Shift', sql.NVarChar, payload.shift || payrollEmployee?.Shift || '')
    .input('EmpType', sql.NVarChar, payload.empType || payrollEmployee?.EmpType || '')
    .input('LeaveType', sql.NVarChar, payload.leaveType || 'EL')
    .input('StartDate', sql.DateTime, payload.startDate)
    .input('EndDate', sql.DateTime, payload.endDate)
    .input('FromTime', sql.NVarChar, payload.fromTime || null)
    .input('ToTime', sql.NVarChar, payload.toTime || null)
    .input('CapInTime', sql.NVarChar, attendanceTimes.CapInTime || null)
    .input('CapOutTime', sql.NVarChar, attendanceTimes.CapOutTime || null)
    .input('TotalDays', sql.Decimal(5, 2), requestedDays)
    .input('Reason', sql.NVarChar, payload.reason || '')
    .input('RelieverId', sql.NVarChar, payload.relieverId || null)
    .input('RelieverName', sql.NVarChar, payload.relieverName || null)
    .input('ContactNumber', sql.NVarChar, payload.contactNumber || null)
    .input('AttachmentName', sql.NVarChar, payload.attachmentName || null)
    .input('AttachmentType', sql.NVarChar, payload.attachmentType || null)
    .input('ApprovalFlow', sql.NVarChar, payload.approvalFlow || '')
    .input('CurrentApprover', sql.NVarChar, payload.currentApprover || '')
    .input('TranId', sql.BigInt, tranId)
    .input('TranDate', sql.DateTime, tranDate)
    .input('MorningLateBy', sql.Decimal(18, 3), morningLateBy)
    .query(`
      INSERT INTO dbo.LeaveRequests (
        ApplicantId,
        ApplicantName,
        Department,
        Section,
        Shift,
        EmpType,
        LeaveType,
        StartDate,
        EndDate,
        FromTime,
        ToTime,
        CAPINTIME,
        CAPOUTTIME,
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
        UpdatedAt,
        TranId,
        TranDate,
        MorningLateBy
      )
      OUTPUT INSERTED.*
      VALUES (
        @ApplicantId,
        @ApplicantName,
        @Department,
        @Section,
        @Shift,
        @EmpType,
        @LeaveType,
        @StartDate,
        @EndDate,
        @FromTime,
        @ToTime,
        @CapInTime,
        @CapOutTime,
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
        GETDATE(),
        @TranId,
        @TranDate,
        @MorningLateBy
      );
    `);

  // Balance is NOT deducted here — it's deducted only when the request is
  // fully approved (see updateLeaveRequestStatus).
  return result.recordset[0] || null;
}

export async function createLeaveRequestWithInitialApproval(payload, approverId) {
  await ensureLeaveTables();
  const pool = await getPool();
  const payrollEmployee = await getPayrollEmployeeDetails(payload.applicantId).catch(() => null);

  // Only pull CAP In/Out time from AttmSystem when the leave type is COFF
  const attendanceTimes = payload.leaveType === 'COFF'
    ? await getAttendanceTimesForDate(payload.applicantId, payload.startDate).catch(() => ({ CapInTime: null, CapOutTime: null }))
    : { CapInTime: null, CapOutTime: null };

  const requestedDays = Number(payload.totalDays || 1);
  const balanceKind = resolveBalanceKind(payload.leaveType);

  if (balanceKind === 'EL') {
    const availableEl = Number(payrollEmployee?.EarnLeaveBalance ?? 0);
    if (requestedDays > availableEl) {
      throw new Error(`Insufficient EL balance. Available: ${availableEl.toFixed(2)}, Requested: ${requestedDays.toFixed(2)}.`);
    }
  }

  if (balanceKind === 'SL') {
    const availableSl = Number(payrollEmployee?.SickLeaveBalance ?? 0);
    if (requestedDays > availableSl) {
      throw new Error(`Insufficient SL balance. Available: ${availableSl.toFixed(2)}, Requested: ${requestedDays.toFixed(2)}.`);
    }
  }

  const tranId = generateTranId(payload.applicantId);
  const tranDate = nowAsLocalDateTimeTruncated();
  const morningLateBy = String(payload.leaveType || '').replace(/\s/g, '').toLowerCase() === '1hour'
    ? await getMorningLateByForDate(payload.applicantId, payload.startDate).catch(() => null)
    : null;

  const transaction = new sql.Transaction(pool);

  await transaction.begin();

  try {
    const request = await transaction.request()
      .input('ApplicantId', sql.NVarChar, String(payload.applicantId || '').trim())
      .input('ApplicantName', sql.NVarChar, payload.applicantName || '')
      .input('Department', sql.NVarChar, payload.department || payrollEmployee?.DeptCode || '')
      .input('Section', sql.NVarChar, payload.section || payrollEmployee?.Section || '')
      .input('Shift', sql.NVarChar, payload.shift || payrollEmployee?.Shift || '')
      .input('EmpType', sql.NVarChar, payload.empType || payrollEmployee?.EmpType || '')
      .input('LeaveType', sql.NVarChar, payload.leaveType || 'EL')
      .input('StartDate', sql.DateTime, payload.startDate)
      .input('EndDate', sql.DateTime, payload.endDate)
      .input('FromTime', sql.NVarChar, payload.fromTime || null)
      .input('ToTime', sql.NVarChar, payload.toTime || null)
      .input('CapInTime', sql.NVarChar, attendanceTimes.CapInTime || null)
      .input('CapOutTime', sql.NVarChar, attendanceTimes.CapOutTime || null)
      .input('TotalDays', sql.Decimal(5, 2), requestedDays)
      .input('Reason', sql.NVarChar(sql.MAX), payload.reason || '')
      .input('RelieverId', sql.NVarChar, payload.relieverId || null)
      .input('RelieverName', sql.NVarChar, payload.relieverName || null)
      .input('ContactNumber', sql.NVarChar, payload.contactNumber || null)
      .input('AttachmentName', sql.NVarChar, payload.attachmentName || null)
      .input('AttachmentType', sql.NVarChar, payload.attachmentType || null)
      .input('ApprovalFlow', sql.NVarChar, payload.approvalFlow || '')
      .input('CurrentApprover', sql.NVarChar, payload.currentApprover || '')
      .input('TranId', sql.BigInt, tranId)
      .input('TranDate', sql.DateTime, tranDate)
      .input('MorningLateBy', sql.Decimal(18, 3), morningLateBy)
      .query(`
        INSERT INTO dbo.LeaveRequests (
          ApplicantId, ApplicantName, Department, Section, Shift, EmpType, LeaveType, StartDate, EndDate, FromTime, ToTime, CAPINTIME, CAPOUTTIME, TotalDays,
          Reason, RelieverId, RelieverName, ContactNumber, AttachmentName,
          AttachmentType, ApprovalFlow, CurrentApprover, Status, UpdatedAt,
          TranId, TranDate, MorningLateBy
        )
        OUTPUT INSERTED.*
        VALUES (
          @ApplicantId, @ApplicantName, @Department, @Section, @Shift, @EmpType, @LeaveType, @StartDate, @EndDate, @FromTime, @ToTime, @CapInTime, @CapOutTime, @TotalDays,
          @Reason, @RelieverId, @RelieverName, @ContactNumber, @AttachmentName,
          @AttachmentType, @ApprovalFlow, @CurrentApprover, 'PENDING', GETDATE(),
          @TranId, @TranDate, @MorningLateBy
        );
      `);

    const savedLeaveRequest = request.recordset[0];
    if (!savedLeaveRequest?.Id) {
      throw new Error('The leave request was inserted without an ID.');
    }

    await transaction.request()
      .input('LeaveRequestId', sql.Int, savedLeaveRequest.Id)
      .input('ApproverId', sql.NVarChar, String(approverId || '').trim())
      .input('Decision', sql.NVarChar, 'PENDING')
      .input('Remarks', sql.NVarChar(sql.MAX), '')
      .input('StepNumber', sql.Int, 1)
      .query(`
        INSERT INTO dbo.LeaveApprovals (LeaveRequestId, ApproverId, Decision, Remarks, StepNumber)
        VALUES (@LeaveRequestId, @ApproverId, @Decision, @Remarks, @StepNumber);
      `);

    await transaction.commit();

    // Balance is NOT deducted here — it's deducted only when the request is
    // fully approved (see updateLeaveRequestStatus).
    return savedLeaveRequest;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
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

export async function updateLeaveRequestStatus(leaveRequestId, currentApprover, status, approvedBy = null, stepNumber = 0) {
  const pool = await getPool();

  const result = await pool.request()
    .input('LeaveRequestId', sql.Int, leaveRequestId)
    .input('CurrentApprover', sql.NVarChar, currentApprover || '')
    .input('Status', sql.NVarChar, status || 'PENDING')
    .input('ApprovedBy', sql.NVarChar, approvedBy || null)
    .input('StepNumber', sql.Int, stepNumber)
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
          HodApproval = CASE WHEN @StepNumber = 1 AND @ApprovedBy IS NOT NULL AND @ApprovedBy <> '' THEN @ApprovedBy ELSE HodApproval END,
          HodStatus = CASE WHEN @StepNumber = 1 AND @ApprovedBy IS NOT NULL AND @ApprovedBy <> '' THEN 'Accept' ELSE HodStatus END,
          CccApproval = CASE WHEN @StepNumber = 2 AND @ApprovedBy IS NOT NULL AND @ApprovedBy <> '' THEN @ApprovedBy ELSE CccApproval END,
          CccStatus = CASE WHEN @StepNumber = 2 AND @ApprovedBy IS NOT NULL AND @ApprovedBy <> '' THEN 'Accept' ELSE CccStatus END,
          UpdatedAt = GETDATE()
      OUTPUT DELETED.Status AS PreviousStatus, INSERTED.Status AS NewStatus, INSERTED.CccStatus AS UpdatedCccStatus, INSERTED.ApplicantId, INSERTED.LeaveType, INSERTED.TotalDays
      WHERE Id = @LeaveRequestId;
    `);

  const row = result.recordset[0];
  const justBecameApproved = row && row.PreviousStatus !== 'APPROVED' && status === 'APPROVED';
  const cccWasAccepted = Boolean(row && String(row.UpdatedCccStatus || '').trim().toLowerCase() === 'accept');

  if (cccWasAccepted) {
    await syncAcceptedLeaveRequestToArchive(leaveRequestId);
  }

  if (justBecameApproved) {
    const updatedBalance = await deductLeaveBalance(row.ApplicantId, row.LeaveType, row.TotalDays).catch((err) => {
      console.error('Failed to deduct leave balance for', row.ApplicantId, row.LeaveType, ':', err.message);
      return null;
    });
    console.log('[updateLeaveRequestStatus] Balance deducted on final approval:', { applicantId: row.ApplicantId, leaveType: row.LeaveType, totalDays: row.TotalDays, updatedBalance });
  }
}

export async function updateLeaveRequestRejection(leaveRequestId, rejectedBy, reason, stepNumber = 0) {
  const pool = await getPool();

  await pool.request()
    .input('LeaveRequestId', sql.Int, leaveRequestId)
    .input('RejectedBy', sql.NVarChar, rejectedBy || '')
    .input('RejectionReason', sql.NVarChar, reason || '')
    .input('StepNumber', sql.Int, stepNumber)
    .query(`
      UPDATE dbo.LeaveRequests
      SET RejectedBy = @RejectedBy,
          RejectionReason = @RejectionReason,
          RejectedAt = CASE WHEN RejectedAt IS NULL THEN GETDATE() ELSE RejectedAt END,
          HodApproval = CASE WHEN @StepNumber = 1 THEN @RejectedBy ELSE HodApproval END,
          HodStatus = CASE WHEN @StepNumber = 1 THEN 'REJECTED' ELSE HodStatus END,
          HodRejectId = CASE WHEN @StepNumber = 1 THEN @RejectedBy ELSE HodRejectId END,
          HodRejectReason = CASE WHEN @StepNumber = 1 THEN @RejectionReason ELSE HodRejectReason END,
          CccApproval = CASE WHEN @StepNumber = 2 THEN @RejectedBy ELSE CccApproval END,
          CccStatus = CASE WHEN @StepNumber = 2 THEN 'REJECTED' ELSE CccStatus END,
          CccRejectId = CASE WHEN @StepNumber = 2 THEN @RejectedBy ELSE CccRejectId END,
          CccRejectReason = CASE WHEN @StepNumber = 2 THEN @RejectionReason ELSE CccRejectReason END,
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
        Department,
        Section,
        Shift,
        EmpType,
        LeaveType,
        StartDate,
        EndDate,
        FromTime,
        ToTime,
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
        HodApproval,
        HodStatus,
        CccApproval,
        CccStatus,
        HrApproval,
        HrStatus,
        Status,
        CreatedAt,
        UpdatedAt,
        TranId,
        TranDate
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
        lr.Department,
        lr.Section,
        lr.Shift,
        lr.EmpType,
        lr.LeaveType,
        lr.StartDate,
        lr.EndDate,
        lr.FromTime,
        lr.ToTime,
        lr.TotalDays,
        lr.Reason,
        lr.RelieverId,
        lr.RelieverName,
        lr.ContactNumber,
        lr.AttachmentName,
        lr.AttachmentType,
        lr.ApprovalFlow,
        lr.CurrentApprover,
        ${approvedBySql} AS ApprovedBy,
        lr.ApprovedAt,
        lr.HodApproval,
        lr.HodStatus,
        lr.CccApproval,
        lr.CccStatus,
        lr.HrApproval,
        lr.HrStatus,
        lr.Status,
        lr.CreatedAt,
        lr.CreatedAt AS DateApplied,
        la.CreatedAt AS ApprovalCreatedAt,
        lr.TranId,
        lr.TranDate
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
        lr.Id,
        lr.ApplicantId,
        lr.ApplicantName,
        lr.Department,
        lr.Section,
        lr.Shift,
        lr.EmpType,
        lr.LeaveType,
        lr.StartDate,
        lr.EndDate,
        lr.FromTime,
        lr.ToTime,
        lr.TotalDays,
        lr.Reason,
        lr.RelieverId,
        lr.RelieverName,
        lr.ContactNumber,
        lr.AttachmentName,
        lr.AttachmentType,
        lr.ApprovalFlow,
        lr.CurrentApprover,
        lr.Status,
        ${approvedBySql} AS ApprovedBy,
        lr.ApprovedAt,
        lr.HodApproval,
        lr.HodStatus,
        lr.CccApproval,
        lr.CccStatus,
        lr.HrApproval,
        lr.HrStatus,
        lr.CreatedAt,
        lr.CreatedAt AS DateApplied,
        lr.TranId,
        lr.TranDate
      FROM dbo.LeaveRequests lr
      WHERE lr.Status = 'PENDING' AND lr.CurrentApprover = @CurrentApprover
      ORDER BY lr.CreatedAt DESC;
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
        lr.Id,
        lr.ApplicantId,
        lr.ApplicantName,
        lr.Department,
        lr.Section,
        lr.Shift,
        lr.EmpType,
        lr.LeaveType,
        lr.StartDate,
        lr.EndDate,
        lr.FromTime,
        lr.ToTime,
        lr.TotalDays,
        lr.Reason,
        lr.RelieverId,
        lr.RelieverName,
        lr.ContactNumber,
        lr.AttachmentName,
        lr.AttachmentType,
        lr.ApprovalFlow,
        lr.CurrentApprover,
        ${approvedBySql} AS ApprovedBy,
        lr.ApprovedAt,
        lr.HodApproval,
        lr.HodStatus,
        lr.CccApproval,
        lr.CccStatus,
        lr.HrApproval,
        lr.HrStatus,
        lr.Status,
        lr.CreatedAt,
        lr.CreatedAt AS DateApplied,
        lr.TranId,
        lr.TranDate
      FROM dbo.LeaveRequests lr
      WHERE lr.ApplicantId = @ApplicantId
      ORDER BY lr.CreatedAt DESC;
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
        lr.Id,
        lr.ApplicantId,
        lr.ApplicantName,
        lr.Department,
        lr.Section,
        lr.Shift,
        lr.EmpType,
        lr.LeaveType,
        lr.StartDate,
        lr.EndDate,
        lr.FromTime,
        lr.ToTime,
        lr.TotalDays,
        lr.Reason,
        lr.RelieverId,
        lr.RelieverName,
        lr.ContactNumber,
        lr.AttachmentName,
        lr.AttachmentType,
        lr.ApprovalFlow,
        lr.CurrentApprover,
        ${approvedBySql} AS ApprovedBy,
        lr.ApprovedAt,
        lr.HodApproval,
        lr.HodStatus,
        lr.CccApproval,
        lr.CccStatus,
        lr.HrApproval,
        lr.HrStatus,
        lr.Status,
        lr.CreatedAt,
        lr.CreatedAt AS DateApplied,
        lr.UpdatedAt,
        lr.TranId,
        lr.TranDate
      FROM dbo.LeaveRequests lr
      ORDER BY lr.CreatedAt DESC;
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

export async function hasDuplicateLeaveRequest(applicantId, startDate) {
  await ensureLeaveTables();
  const pool = await getPool();

  const result = await pool.request()
    .input('ApplicantId', sql.NVarChar, String(applicantId || '').trim())
    .input('StartDate', sql.DateTime, new Date(startDate))
    .query(`
      SELECT COUNT(*) as count
      FROM dbo.LeaveRequests
      WHERE ApplicantId = @ApplicantId
        AND DATEDIFF(day, StartDate, @StartDate) = 0
        AND Status <> 'REJECTED';
    `);

  return (result.recordset[0]?.count || 0) > 0;
}


