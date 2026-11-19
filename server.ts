import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import {
  handleCustomerMessage,
  createInitialContext,
} from './src/server/agentResolver.ts';
import {
  runSingleScenario,
  runAllScenarios,
  SCENARIO_DEFINITIONS,
} from './src/server/scenariosRunner.ts';
import {
  resetWorkDatabase,
  getAuditLogs,
  readTable,
  BACKUP_DIR,
  WORK_DIR,
  createTimestampedBackup,
} from './src/server/h9loopDb.ts';

const app = express();
const PORT = 3000;

app.use(express.json());

// API Routes

// 1. Reset Database to original state
app.post('/api/reset-data', (req, res) => {
  try {
    resetWorkDatabase(WORK_DIR);
    sessionStore.clear();
    res.json({ success: true, message: 'Working database reset to initial original state.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// In-memory conversation session store to maintain multi-turn memory
const sessionStore = new Map<string, any>();

// Reset chat session
app.post('/api/chat/reset', (req, res) => {
  const sessionId = req.body?.session_id || (req.headers['x-session-id'] as string) || 'default-session';
  sessionStore.delete(sessionId);
  const newCtx = createInitialContext(WORK_DIR);
  sessionStore.set(sessionId, newCtx);
  res.json({ success: true, message: 'Chat session reset', context: newCtx, session_id: sessionId });
});

// 2. Chat with Agent
app.post('/api/chat', async (req, res) => {
  try {
    const { message, context, session_id } = req.body;
    const sessionId = session_id || (req.headers['x-session-id'] as string) || 'default-session';

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    let activeCtx = sessionStore.get(sessionId);
    if (!activeCtx) {
      activeCtx = context ? { ...context } : createInitialContext(WORK_DIR);
    } else if (context) {
      // Intelligently merge context to preserve already acquired credentials and order numbers
      activeCtx = {
        ...activeCtx,
        ...context,
        case_block: {
          ...activeCtx.case_block,
          ...(context.case_block || {}),
          order_number: context.case_block?.order_number || activeCtx.case_block?.order_number || null,
          customer_id: context.case_block?.customer_id || activeCtx.case_block?.customer_id || null,
          verified: context.case_block?.verified !== undefined ? (context.case_block.verified || activeCtx.case_block?.verified) : activeCtx.case_block?.verified,
        },
        provided_email: context.provided_email || activeCtx.provided_email || null,
        provided_phone_last4: context.provided_phone_last4 || activeCtx.provided_phone_last4 || null,
      };
    }

    const response = await handleCustomerMessage(message, activeCtx);
    sessionStore.set(sessionId, response.context);

    res.json({
      ...response,
      session_id: sessionId,
    });
  } catch (err: any) {
    console.error('Chat error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 3. Get Scenarios list
app.get('/api/scenarios', (req, res) => {
  res.json({ scenarios: SCENARIO_DEFINITIONS });
});

// 4. Run Single Scenario
app.post('/api/scenarios/run-single', async (req, res) => {
  try {
    const { scenario_id } = req.body;
    const scenario = SCENARIO_DEFINITIONS.find((s) => s.id === scenario_id);
    if (!scenario) {
      return res.status(404).json({ error: `Scenario ${scenario_id} not found` });
    }
    const result = await runSingleScenario(scenario);
    res.json(result);
  } catch (err: any) {
    console.error('Run single scenario error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 5. Run All Scenarios
app.post('/api/scenarios/run-all', async (req, res) => {
  try {
    const results = await runAllScenarios();
    res.json({ results });
  } catch (err: any) {
    console.error('Run all scenarios error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 6. Audit Trail
app.get('/api/audit-trail', (req, res) => {
  try {
    const logs = getAuditLogs();
    res.json({ logs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Backups list
app.get('/api/backups', (req, res) => {
  try {
    if (!fs.existsSync(BACKUP_DIR)) {
      return res.json({ backups: [] });
    }
    const backups = fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => fs.statSync(path.join(BACKUP_DIR, f)).isDirectory())
      .map((name) => {
        const full = path.join(BACKUP_DIR, name);
        const stat = fs.statSync(full);
        const files = fs.readdirSync(full);
        return {
          id: name,
          timestamp: stat.mtime.toISOString(),
          filesCount: files.length,
          files,
        };
      })
      .reverse();
    res.json({ backups });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 8. Manual trigger backup
app.post('/api/backups/create', (req, res) => {
  try {
    const stamp = createTimestampedBackup();
    res.json({ success: true, stamp });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 9. Inspect Database Table
app.get('/api/database/:table', (req, res) => {
  try {
    const { table } = req.params;
    const allowed = ['customers', 'products', 'orders', 'payments', 'refunds', 'support_cases', 'policies'];
    if (!allowed.includes(table)) {
      return res.status(400).json({ error: `Table '${table}' is not supported.` });
    }
    const rows = readTable(table, WORK_DIR);
    res.json({ table, count: rows.length, rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Initialize server with Vite middleware in development
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true, port: PORT, host: '0.0.0.0' },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`H9loop Support Resolver Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
