import {
  AgentContext,
  AgentResponse,
  AuditLogEntry,
  ScenarioDefinition,
  ScenarioTestResult,
} from '../types/h9loop.ts';

export async function sendChatMessage(
  message: string,
  context?: AgentContext,
  sessionId?: string
): Promise<AgentResponse & { session_id?: string }> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(sessionId ? { 'x-session-id': sessionId } : {}),
    },
    body: JSON.stringify({ message, context, session_id: sessionId }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: 'Network error' }));
    throw new Error(errorData.error || 'Failed to send message');
  }
  return res.json();
}

export async function resetChatSession(sessionId?: string): Promise<{ success: boolean; context: AgentContext }> {
  const res = await fetch('/api/chat/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId }),
  });
  if (!res.ok) {
    throw new Error('Failed to reset chat session');
  }
  return res.json();
}

export async function resetDatabase(): Promise<{ success: boolean; message: string }> {
  const res = await fetch('/api/reset-data', { method: 'POST' });
  if (!res.ok) {
    throw new Error('Failed to reset database');
  }
  return res.json();
}

export async function fetchScenarios(): Promise<ScenarioDefinition[]> {
  const res = await fetch('/api/scenarios');
  if (!res.ok) {
    throw new Error('Failed to fetch scenarios');
  }
  const data = await res.json();
  return data.scenarios;
}

export async function runScenarioSingle(scenarioId: string): Promise<ScenarioTestResult> {
  const res = await fetch('/api/scenarios/run-single', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenario_id: scenarioId }),
  });
  if (!res.ok) {
    throw new Error(`Failed to run scenario ${scenarioId}`);
  }
  return res.json();
}

export async function runScenariosAll(): Promise<ScenarioTestResult[]> {
  const res = await fetch('/api/scenarios/run-all', { method: 'POST' });
  if (!res.ok) {
    throw new Error('Failed to run all scenarios');
  }
  const data = await res.json();
  return data.results;
}

export async function fetchAuditLogs(): Promise<AuditLogEntry[]> {
  const res = await fetch('/api/audit-trail');
  if (!res.ok) {
    throw new Error('Failed to fetch audit logs');
  }
  const data = await res.json();
  return data.logs;
}

export async function fetchBackups(): Promise<any[]> {
  const res = await fetch('/api/backups');
  if (!res.ok) {
    throw new Error('Failed to fetch backups');
  }
  const data = await res.json();
  return data.backups;
}

export async function createManualBackup(): Promise<{ success: boolean; stamp: string }> {
  const res = await fetch('/api/backups/create', { method: 'POST' });
  if (!res.ok) {
    throw new Error('Failed to create backup');
  }
  return res.json();
}

export async function fetchTableRows(tableName: string): Promise<{ table: string; count: number; rows: any[] }> {
  const res = await fetch(`/api/database/${tableName}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch table ${tableName}`);
  }
  return res.json();
}
