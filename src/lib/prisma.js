import { PrismaClient } from '@prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';

function parseConnectionString(url) {
  if (!url) {
    throw new Error("DATABASE_URL environment variable is not defined");
  }

  // Parse server and port
  const serverPortMatch = url.match(/sqlserver:\/\/([^;:]+)(?::(\d+))?/);
  if (!serverPortMatch) {
    throw new Error("Invalid DATABASE_URL format. Expected sqlserver://[server]:[port];...");
  }
  const server = serverPortMatch[1];
  const port = serverPortMatch[2] ? parseInt(serverPortMatch[2], 10) : 1433;

  // Parse semicolon-separated parameters
  const params = {};
  const semicolonIndex = url.indexOf(';');
  if (semicolonIndex !== -1) {
    const queryStr = url.substring(semicolonIndex + 1);
    const parts = queryStr.split(';');
    for (const part of parts) {
      const eqIndex = part.indexOf('=');
      if (eqIndex !== -1) {
        const key = part.substring(0, eqIndex).trim();
        const value = part.substring(eqIndex + 1).trim();
        params[key] = value;
      }
    }
  }

  return {
    server,
    port,
    database: params.database || '',
    user: params.user || '',
    password: params.password || '',
    options: {
      encrypt: params.encrypt === 'true',
      trustServerCertificate: params.trustServerCertificate === 'true',
    }
  };
}

let prisma;

const config = parseConnectionString(process.env.DATABASE_URL);
const adapter = new PrismaMssql(config);

if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient({ adapter });
} else {
  if (!global.prisma) {
    global.prisma = new PrismaClient({ adapter });
  }
  prisma = global.prisma;
}

export { prisma };
