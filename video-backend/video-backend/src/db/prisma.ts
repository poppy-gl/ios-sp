import 'dotenv/config';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '../generated/prisma/client.js';

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? 'file:C:/video-backend/data/app.db',
});

export const prisma = new PrismaClient({ adapter });
