import { NextResponse } from 'next/server';
import { getLeaveDocumentByTranId } from '@/lib/leaveDocumentStorage';

export async function GET(request, { params }) {
  try {
    const { tranId } = await params;
    const document = await getLeaveDocumentByTranId(tranId);

    if (!document) {
      return NextResponse.json({ error: 'No document found for this leave request.' }, { status: 404 });
    }

      const fileBuffer = Buffer.isBuffer(document.buffer)
        ? document.buffer
        : Buffer.from(document.buffer || []);

    if (!fileBuffer || fileBuffer.length === 0) {
      throw new Error('The decrypted file buffer is empty.');
    }

      const mimeType = document.mimeType || 'application/octet-stream';
      let extension = String(document.filename || '');
      if (!extension.startsWith('.')) extension = extension ? `.${extension}` : '.pdf';
      const safeFilename = `leave-document${extension}`;

      // Diagnostic logging: report sizes and initial bytes to aid debugging corrupted files.
      try {
        const firstBytes = fileBuffer.subarray(0, 16);
        const hex = Array.from(firstBytes).map((b) => b.toString(16).padStart(2, '0')).join(' ');
        console.debug('Leave document serve:', { tranId: document.tranId, filename: document.filename, mimeType, length: fileBuffer.length, firstBytesHex: hex });
      } catch (e) {
        console.debug('Leave document serve: failed to read buffer preview', e && e.message);
      }

    return new NextResponse(Uint8Array.from(fileBuffer), {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': `inline; filename="${safeFilename}"`,
        'Content-Length': String(fileBuffer.length),
      },
    });
  } catch (error) {
    console.error('Leave document retrieval error:', error);
    return new NextResponse('Failed to retrieve leave document.', {
      status: 500,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}
