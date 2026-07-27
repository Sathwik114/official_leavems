import sql from 'mssql';

const ATTM_SYSTEM_CONFIG = {
  user: process.env.ATT_DB_USER || 'paydev',
  password: process.env.ATT_DB_PASSWORD || 'dev.gtipay@123',
  server: process.env.ATT_DB_SERVER || '10.40.10.105',
  database: process.env.ATT_DB_NAME || 'AttmSystem',
  port: Number(process.env.ATT_DB_PORT || 1433),
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
};

let attmPoolPromise;

async function getAttmSystemPool() {
  if (!attmPoolPromise) {
    attmPoolPromise = new sql.ConnectionPool(ATTM_SYSTEM_CONFIG).connect();
  }

  return attmPoolPromise;
}

const SUPPORTED_UPLOADS = {
  '.pdf': { mime: 'application/pdf' },
  '.jpg': { mime: 'image/jpeg' },
  '.jpeg': { mime: 'image/jpeg' },
  '.png': { mime: 'image/png' },
  '.gif': { mime: 'image/gif' },
  '.webp': { mime: 'image/webp' },
  '.bmp': { mime: 'image/bmp' },
  '.tif': { mime: 'image/tiff' },
  '.tiff': { mime: 'image/tiff' },
  '.svg': { mime: 'image/svg+xml' },
};

function normalizeExtension(filename = '') {
  const match = String(filename || '').toLowerCase().match(/\.([a-z0-9]+)$/i);
  return match ? `.${match[1]}` : '';
}

function normalizeMimeType(mimeType = '') {
  return String(mimeType || '').toLowerCase().trim();
}

// No encryption: store and retrieve raw file buffers directly, matching C# behavior.

export function getLeaveDocumentMimeType(filename = '') {
  const extension = normalizeExtension(filename);
  return SUPPORTED_UPLOADS[extension]?.mime || 'application/octet-stream';
}

export async function validateLeaveDocumentFile(file, originalName = '', originalMimeType = '') {
  if (!file || typeof file.arrayBuffer !== 'function') {
    throw new Error('Invalid file upload.');
  }

  const extension = normalizeExtension(originalName || file.name || '');
  const expectedMimeType = SUPPORTED_UPLOADS[extension]?.mime;

  if (!extension || !expectedMimeType) {
    throw new Error('Unsupported file type. Only PDF and common image files are allowed.');
  }

  const mimeType = normalizeMimeType(originalMimeType || file.type || '');
  if (!mimeType) {
    throw new Error('The uploaded file is missing a valid MIME type.');
  }

  if (mimeType !== expectedMimeType) {
    throw new Error(`The uploaded file type ${mimeType} does not match the allowed extension ${extension}.`);
  }

  return {
    buffer: Buffer.from(await file.arrayBuffer()),
    extension,
    mimeType,
  };
}

// Encryption removed — functions intentionally omitted.

export async function ensureLeaveDocumentTable() {
  const pool = await getAttmSystemPool();
  await pool.request().query(`
    IF OBJECT_ID(N'dbo.OnlineLeavePDF', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.OnlineLeavePDF (
        Rowid INT IDENTITY(1,1) PRIMARY KEY,
        TranId NVARCHAR(20) NOT NULL,
        Filename NVARCHAR(30) NOT NULL,
        PdfFile VARBINARY(MAX) NOT NULL
      )
    END
  `);
}

export async function saveLeaveDocument(tranId, file, originalName = '', originalMimeType = '') {
  const normalizedTranId = String(tranId || '').trim();
  if (!normalizedTranId) {
    throw new Error('A leave transaction id is required to save the document.');
  }

  const { buffer: fileBuffer, extension, mimeType } = await validateLeaveDocumentFile(file, originalName, originalMimeType);

  try {
    const firstBytes = fileBuffer.subarray(0, 16);
    const hex = Array.from(firstBytes).map((b) => b.toString(16).padStart(2, '0')).join(' ');
    console.debug('Saving leave document upload:', { tranId: normalizedTranId, originalName, extension, mimeType, size: fileBuffer.length, firstBytesHex: hex });
  } catch (e) {
    console.debug('Saving leave document: failed to compute preview', e && e.message);
  }

  await ensureLeaveDocumentTable();

  const pool = await getAttmSystemPool();
  const request = pool.request();
  request.input('TranId', sql.NVarChar(20), normalizedTranId);
  request.input('Filename', sql.NVarChar(30), extension);
  request.input('PdfFile', sql.VarBinary(sql.MAX), fileBuffer);

  await request.query(`
    IF EXISTS (SELECT 1 FROM dbo.OnlineLeavePDF WHERE TranId = @TranId)
    BEGIN
      UPDATE dbo.OnlineLeavePDF
      SET Filename = @Filename, PdfFile = @PdfFile
      WHERE TranId = @TranId
    END
    ELSE
    BEGIN
      INSERT INTO dbo.OnlineLeavePDF (TranId, Filename, PdfFile)
      VALUES (@TranId, @Filename, @PdfFile)
    END
  `);

  return { tranId: normalizedTranId, filename: extension, mimeType };
}

export async function getLeaveDocumentByTranId(tranId) {
  const normalizedTranId = String(tranId || '').trim();
  if (!normalizedTranId) {
    throw new Error('A leave transaction id is required to retrieve the document.');
  }

  await ensureLeaveDocumentTable();

  const pool = await getAttmSystemPool();
  const result = await pool.request()
    .input('TranId', sql.NVarChar(20), normalizedTranId)
    .query(`
      SELECT TOP 1 TranId, Filename, PdfFile
      FROM dbo.OnlineLeavePDF
      WHERE TranId = @TranId
    `);

  const row = result.recordset[0] || null;
  if (!row) {
    return null;
  }
  try {
    console.debug('Retrieved leave document row:', { tranId: normalizedTranId, dbFilename: row.Filename, rawLength: (row.PdfFile && row.PdfFile.length) || null });
  } catch (e) {
    console.debug('Leave document retrieval: failed to log raw row info', e && e.message);
  }

  // Row.PdfFile should already be binary (Buffer). Convert to Buffer to be safe.
  const fileBufferFromDb = Buffer.isBuffer(row.PdfFile) ? row.PdfFile : Buffer.from(row.PdfFile || []);

  try {
    const firstBytes = fileBufferFromDb.subarray(0, 16);
    const hex = Array.from(firstBytes).map((b) => b.toString(16).padStart(2, '0')).join(' ');
    console.debug('Leave document preview (raw):', { tranId: normalizedTranId, length: fileBufferFromDb.length, firstBytesHex: hex });
  } catch (e) {
    console.debug('Leave document: failed to compute preview', e && e.message);
  }

  const mimeType = getLeaveDocumentMimeType(row.Filename);

  return {
    tranId: String(row.TranId || normalizedTranId),
    filename: String(row.Filename || ''),
    mimeType,
    buffer: fileBufferFromDb,
  };
}
