import React, { useState, useEffect } from 'react';
import { Header } from './components/Header.tsx';
import { ChatView } from './components/ChatView.tsx';
import { SidePanel } from './components/SidePanel.tsx';
import { TestRunnerView } from './components/TestRunnerView.tsx';
import { AuditTrailView } from './components/AuditTrailView.tsx';
import { DatabaseBrowser } from './components/DatabaseBrowser.tsx';
import { SevenMistakesView } from './components/SevenMistakesView.tsx';
import {
  AgentContext,
  ScenarioDefinition,
  AuditLogEntry,
  ScenarioTestResult,
} from './types/h9loop.ts';
import {
  sendChatMessage,
  resetDatabase,
  fetchScenarios,
  runScenarioSingle,
  runScenariosAll,
  fetchAuditLogs,
} from './services/api.ts';

interface Message {
  id: string;
  sender: 'customer' | 'agent';
  text: string;
  timestamp: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'chat' | 'tests' | 'audit' | 'database' | 'mistakes'>('chat');
  const [isResettingDb, setIsResettingDb] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  // Chat State
  const [sessionId, setSessionId] = useState<string>(() => 'sess-' + Date.now());
  const [messages, setMessages] = useState<Message[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [agentContext, setAgentContext] = useState<AgentContext>({
    case_block: {
      customer_id: null,
      order_number: null,
      product_id: null,
      amount_zar: null,
      order_date: null,
      refund_type: null,
      refund_id: null,
      case_number: null,
      verified: false,
      attempts_left: 2,
    },
    decisions: [],
    tool_calls: [],
    conversation_ended: false,
    user_confirmed_refund: false,
    dataDir: 'data_work',
  });

  const agentContextRef = React.useRef<AgentContext>(agentContext);
  useEffect(() => {
    agentContextRef.current = agentContext;
  }, [agentContext]);

  // Test Runner State
  const [scenarios, setScenarios] = useState<ScenarioDefinition[]>([]);
  const [scenarioResults, setScenarioResults] = useState<Record<string, ScenarioTestResult>>({});
  const [isRunningAllTests, setIsRunningAllTests] = useState(false);
  const [runningSingleId, setRunningSingleId] = useState<string | null>(null);

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);

  // Load scenarios on mount
  useEffect(() => {
    loadScenariosList();
    loadAuditTrail();
  }, []);

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 4000);
  };

  const loadScenariosList = async () => {
    try {
      const list = await fetchScenarios();
      setScenarios(list);
    } catch (err) {
      console.error('Failed to load scenarios:', err);
    }
  };

  const loadAuditTrail = async () => {
    setIsLoadingAudit(true);
    try {
      const logs = await fetchAuditLogs();
      setAuditLogs(logs);
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setIsLoadingAudit(false);
    }
  };

  // Reset Database
  const handleResetDb = async () => {
    setIsResettingDb(true);
    try {
      const res = await resetDatabase();
      showNotification(res.message);
      handleResetChat();
      await loadAuditTrail();
    } catch (err: any) {
      showNotification(`Error: ${err.message}`);
    } finally {
      setIsResettingDb(false);
    }
  };

  // Reset Chat Conversation
  const handleResetChat = async () => {
    const newSessionId = 'sess-' + Date.now();
    setSessionId(newSessionId);
    setMessages([]);
    const freshContext: AgentContext = {
      case_block: {
        customer_id: null,
        order_number: null,
        product_id: null,
        amount_zar: null,
        order_date: null,
        refund_type: null,
        refund_id: null,
        case_number: null,
        verified: false,
        attempts_left: 2,
      },
      decisions: [],
      tool_calls: [],
      conversation_ended: false,
      user_confirmed_refund: false,
      dataDir: 'data_work',
    };
    setAgentContext(freshContext);
    agentContextRef.current = freshContext;

    try {
      await fetch('/api/chat/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: newSessionId }),
      });
    } catch (e) {
      // Ignore
    }
  };

  // Send message in Chat
  const handleSendMessage = async (text: string) => {
    const userMsg: Message = {
      id: `usr-${Date.now()}`,
      sender: 'customer',
      text,
      timestamp: new Date().toLocaleTimeString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsChatLoading(true);

    try {
      const res = await sendChatMessage(text, agentContextRef.current, sessionId);
      setAgentContext(res.context);
      agentContextRef.current = res.context;

      const agentMsg: Message = {
        id: `agt-${Date.now()}`,
        sender: 'agent',
        text: res.reply,
        timestamp: new Date().toLocaleTimeString(),
      };
      setMessages((prev) => [...prev, agentMsg]);
      await loadAuditTrail();
    } catch (err: any) {
      const errorMsg: Message = {
        id: `err-${Date.now()}`,
        sender: 'agent',
        text: `Error processing request: ${err.message}`,
        timestamp: new Date().toLocaleTimeString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsChatLoading(false);
    }
  };

  // Run all 14 scenarios
  const handleRunAllTests = async () => {
    setIsRunningAllTests(true);
    try {
      const results = await runScenariosAll();
      const mapped: Record<string, ScenarioTestResult> = {};
      for (const r of results) {
        mapped[r.scenario_id] = r;
      }
      setScenarioResults(mapped);
      const passed = results.filter((r) => r.passed).length;
      showNotification(`Completed 14 scenarios: ${passed}/14 Passed.`);
      await loadAuditTrail();
    } catch (err: any) {
      showNotification(`Failed to run test suite: ${err.message}`);
    } finally {
      setIsRunningAllTests(false);
    }
  };

  // Run single scenario
  const handleRunSingleTest = async (scId: string) => {
    setRunningSingleId(scId);
    try {
      const res = await runScenarioSingle(scId);
      setScenarioResults((prev) => ({ ...prev, [scId]: res }));
      showNotification(
        `Scenario ${scId}: ${res.passed ? 'PASSED' : 'FAILED'} (${res.actual_outcome})`
      );
      await loadAuditTrail();
    } catch (err: any) {
      showNotification(`Error running ${scId}: ${err.message}`);
    } finally {
      setRunningSingleId(null);
    }
  };

  // Load a scenario into live chat
  const handleLoadScenarioToChat = (sc: ScenarioDefinition) => {
    handleResetChat();
    setActiveTab('chat');
    setTimeout(() => {
      handleSendMessage(sc.customer_request);
    }, 100);
  };

  const passCount = Object.values(scenarioResults).filter((r) => r.passed).length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-white">
      {/* Top Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onResetDb={handleResetDb}
        isResetting={isResettingDb}
        passCount={passCount}
        totalScenarios={scenarios.length || 14}
      />

      {/* Floating Notification */}
      {notification && (
        <div className="fixed bottom-4 right-4 z-50 bg-slate-800 border border-emerald-500/50 text-emerald-300 px-4 py-2.5 rounded-lg shadow-xl text-xs font-medium flex items-center space-x-2 animate-bounce">
          <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
          <span>{notification}</span>
        </div>
      )}

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {/* TAB 1: Chat and Side Panel */}
        {activeTab === 'chat' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7">
              <ChatView
                onSendMessage={handleSendMessage}
                messages={messages}
                isLoading={isChatLoading}
                onResetChat={handleResetChat}
                context={agentContext}
              />
            </div>
            <div className="lg:col-span-5">
              <SidePanel
                caseBlock={agentContext.case_block}
                decisions={agentContext.decisions}
                toolCalls={agentContext.tool_calls}
              />
            </div>
          </div>
        )}

        {/* TAB 2: Test Runner */}
        {activeTab === 'tests' && (
          <TestRunnerView
            scenarios={scenarios}
            results={scenarioResults}
            isRunningAll={isRunningAllTests}
            runningScenarioId={runningSingleId}
            onRunAll={handleRunAllTests}
            onRunSingle={handleRunSingleTest}
            onLoadScenarioToChat={handleLoadScenarioToChat}
          />
        )}

        {/* TAB 3: Audit Trail */}
        {activeTab === 'audit' && (
          <AuditTrailView
            logs={auditLogs}
            isLoading={isLoadingAudit}
            onRefresh={loadAuditTrail}
          />
        )}

        {/* TAB 4: Database Browser */}
        {activeTab === 'database' && <DatabaseBrowser />}

        {/* TAB 5: Seven Mistakes Analysis */}
        {activeTab === 'mistakes' && <SevenMistakesView />}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-4 text-center text-xs text-slate-500">
        H9loop Support Resolver • POPIA Act 4 of 2013 Compliant • Fixed Teaching Reference Date: 2026-10-05
      </footer>
    </div>
  );
}
