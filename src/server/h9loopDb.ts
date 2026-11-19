import fs from 'fs';
import path from 'path';
import {
  Customer,
  Product,
  Order,
  Payment,
  Refund,
  SupportCase,
  Policy,
  AuditLogEntry,
} from '../types/h9loop.ts';

function findBasePath(): string {
  const localAppletPath = path.resolve(process.cwd(), 'h9loop_support');

  // Attempt to create symlink /h9loop_support -> localAppletPath if root symlink doesn't exist
  try {
    if (!fs.existsSync('/h9loop_support')) {
      if (!fs.existsSync(localAppletPath)) {
        fs.mkdirSync(localAppletPath, { recursive: true });
      }
      fs.symlinkSync(localAppletPath, '/h9loop_support');
    }
  } catch (e) {
    // Ignore permissions errors in environments that restrict root
  }

  if (fs.existsSync(localAppletPath)) {
    return localAppletPath;
  }

  if (fs.existsSync('/h9loop_support')) {
    return '/h9loop_support';
  }

  fs.mkdirSync(localAppletPath, { recursive: true });
  return localAppletPath;
}

export const BASE_DIR = findBasePath();
export const ORIG_DIR = path.join(BASE_DIR, 'data_original');
export const WORK_DIR = path.join(BASE_DIR, 'data_work');
export const TEST_DIR = path.join(BASE_DIR, 'testing');
export const BACKUP_DIR = path.join(BASE_DIR, 'backups');
export const AUDIT_DIR = path.join(BASE_DIR, 'audit_trail');
export const DRAFTS_DIR = path.join(BASE_DIR, 'drafts');

// Normalizes any incoming dataDir string to the active server directories
export function resolveDataDir(dir?: string | null): string {
  if (!dir) return WORK_DIR;
  if (dir.includes('testing')) return TEST_DIR;
  if (dir.includes('data_original')) return ORIG_DIR;
  if (dir.includes('data_work')) return WORK_DIR;
  if (fs.existsSync(dir)) return dir;
  return WORK_DIR;
}

// Ensure all dirs exist
for (const d of [ORIG_DIR, WORK_DIR, TEST_DIR, BACKUP_DIR, AUDIT_DIR, DRAFTS_DIR]) {
  if (!fs.existsSync(d)) {
    fs.mkdirSync(d, { recursive: true });
  }
}

// POPIA Masking
export function maskEmail(email: string | null): string | null {
  if (!email) return null;
  const parts = email.split('@');
  if (parts.length !== 2) return '***@***';
  const name = parts[0];
  const domain = parts[1];
  if (name.length <= 2) {
    return `${name[0]}***@${domain}`;
  }
  return `${name[0]}***${name[name.length - 1]}@${domain}`;
}

export function maskPhone(phone: string | null): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/\s+/g, '');
  const last4 = cleaned.slice(-4);
  return `***-***-${last4}`;
}

// Simple RFC4180 CSV Parser
export function parseCSV(content: string): Record<string, string>[] {
  const lines: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (char === '"') {
      if (inQuotes && content[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && content[i + 1] === '\n') {
        i++;
      }
      if (current.trim().length > 0 || lines.length > 0) {
        lines.push(current);
      }
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim().length > 0) {
    lines.push(current);
  }

  if (lines.length === 0) return [];

  function splitLine(line: string): string[] {
    const fields: string[] = [];
    let field = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQ && line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQ = !inQ;
        }
      } else if (c === ',' && !inQ) {
        fields.push(field);
        field = '';
      } else {
        field += c;
      }
    }
    fields.push(field);
    return fields;
  }

  const header = splitLine(lines[0]).map((h) => h.trim());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = splitLine(lines[i]);
    const row: Record<string, string> = {};
    for (let j = 0; j < header.length; j++) {
      row[header[j]] = values[j] !== undefined ? values[j].trim() : '';
    }
    rows.push(row);
  }

  return rows;
}

export function formatCSV(headers: string[], rows: Record<string, unknown>[]): string {
  const escapeField = (val: unknown): string => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headerLine = headers.join(',');
  const lines = rows.map((r) => headers.map((h) => escapeField(r[h])).join(','));
  return [headerLine, ...lines].join('\n') + '\n';
}

// Reset Database from data_original
export function resetWorkDatabase(targetDir?: string): void {
  const target = resolveDataDir(targetDir);
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }
  const files = fs.readdirSync(ORIG_DIR);
  for (const file of files) {
    const src = path.join(ORIG_DIR, file);
    const dst = path.join(target, file);
    fs.copyFileSync(src, dst);
  }
}

// Create timestamped backup
export function createTimestampedBackup(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `backup_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(
    now.getHours()
  )}${pad(now.getMinutes())}${pad(now.getSeconds())}_${now.getMilliseconds()}`;
  const backupFolder = path.join(BACKUP_DIR, stamp);
  fs.mkdirSync(backupFolder, { recursive: true });

  const files = fs.readdirSync(WORK_DIR);
  for (const file of files) {
    const src = path.join(WORK_DIR, file);
    if (fs.statSync(src).isFile()) {
      fs.copyFileSync(src, path.join(backupFolder, file));
    }
  }

  logAudit({
    event_type: 'DATA_BACKUP',
    customer_id: null,
    masked_email: null,
    phone_last4: null,
    order_number: null,
    details: { backupFolder: stamp, filesCount: files.length },
  });

  return stamp;
}

// Read Table
export function readTable<T>(tableName: string, dir?: string): T[] {
  const targetDir = resolveDataDir(dir);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  const filePath = path.join(targetDir, `${tableName}.csv`);
  if (!fs.existsSync(filePath)) {
    // If work file doesn't exist yet, copy from original
    const origPath = path.join(ORIG_DIR, `${tableName}.csv`);
    if (fs.existsSync(origPath)) {
      fs.copyFileSync(origPath, filePath);
    } else {
      return [];
    }
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  const records = parseCSV(content);

  return records.map((r) => {
    const obj: any = {};
    for (const [k, v] of Object.entries(r)) {
      if (
        [
          'price_zar',
          'amount_zar',
          'threshold_zar',
          'fraud_flag',
          'popia_marketing_consent',
          'open_cases',
          'is_digital',
          'is_subscription',
          'refundable',
          'escalate',
        ].includes(k)
      ) {
        obj[k] = v === '' ? null : Number(v);
      } else {
        obj[k] = v;
      }
    }
    return obj as T;
  });
}

// Write Table (Always backups first!)
export function writeTable<T extends object>(
  tableName: string,
  rows: T[],
  dir?: string
): void {
  const targetDir = resolveDataDir(dir);
  // CRITICAL RULE 2: Never modify data_original/. Take timestamped backup before every write.
  if (targetDir === ORIG_DIR) {
    throw new Error('Attempted to write to data_original! data_original is strictly read-only.');
  }
  createTimestampedBackup();

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csvContent = formatCSV(headers, rows as Record<string, unknown>[]);
  fs.writeFileSync(path.join(targetDir, `${tableName}.csv`), csvContent, 'utf-8');
}

// Audit trail logging
export function logAudit(entry: Omit<AuditLogEntry, 'log_id' | 'timestamp'>): void {
  const fullEntry: AuditLogEntry = {
    log_id: `AUD-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
    timestamp: new Date().toISOString(),
    ...entry,
  };
  const auditFile = path.join(AUDIT_DIR, 'audit_log.jsonl');
  fs.appendFileSync(auditFile, JSON.stringify(fullEntry) + '\n', 'utf-8');
}

export function getAuditLogs(): AuditLogEntry[] {
  const auditFile = path.join(AUDIT_DIR, 'audit_log.jsonl');
  if (!fs.existsSync(auditFile)) return [];
  const lines = fs.readFileSync(auditFile, 'utf-8').split('\n').filter((l) => l.trim().length > 0);
  return lines.map((l) => JSON.parse(l)).reverse();
}

// Escalation drafts writer
export function saveEscalationDraft(caseNumber: string, data: Record<string, unknown>): void {
  const draftFile = path.join(DRAFTS_DIR, `${caseNumber}.json`);
  fs.writeFileSync(draftFile, JSON.stringify(data, null, 2), 'utf-8');
}
