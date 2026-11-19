import React, { useState } from 'react';
import {
  ScenarioDefinition,
  ScenarioTestResult,
} from '../types/h9loop.ts';
import {
  Play,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Clock,
  Layers,
  Wrench,
  Cpu,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  ShieldCheck,
  Filter,
} from 'lucide-react';

interface TestRunnerViewProps {
  scenarios: ScenarioDefinition[];
  results: Record<string, ScenarioTestResult>;
  isRunningAll: boolean;
  runningScenarioId: string | null;
  onRunAll: () => Promise<void>;
  onRunSingle: (id: string) => Promise<void>;
  onLoadScenarioToChat: (scenario: ScenarioDefinition) => void;
}

export const TestRunnerView: React.FC<TestRunnerViewProps> = ({
  scenarios,
  results,
  isRunningAll,
  runningScenarioId,
  onRunAll,
  onRunSingle,
  onLoadScenarioToChat,
}) => {
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<'all' | 'passed' | 'failed'>('all');

  const total = scenarios.length;
  const ranCount = Object.keys(results).length;
  const passCount = Object.values(results).filter((r) => r.passed).length;
  const failCount = Object.values(results).filter((r) => !r.passed).length;

  const filteredScenarios = scenarios.filter((sc) => {
    const res = results[sc.id];
    if (filterMode === 'passed') return res && res.passed;
    if (filterMode === 'failed') return res && !res.passed;
    return true;
  });

  const selectedResult = selectedResultId ? results[selectedResultId] : null;

  return (
    <div className="space-y-4">
      {/* Test Runner Controls & Metrics Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-base font-bold text-white tracking-tight">
              H9loop 14 Scenarios Deterministic Test Suite
            </h2>
            <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 border border-slate-700 font-mono">
              Reset before each run
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Each scenario tests strict adherence to <strong>policies.csv</strong>, POPIA identity verification, 14-day calculation against <strong>2026-10-05</strong>, approval limits, and duplicate-charge logic.
          </p>
        </div>

        <div className="flex items-center space-x-3 shrink-0">
          <button
            onClick={onRunAll}
            disabled={isRunningAll || runningScenarioId !== null}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center transition shadow-md cursor-pointer"
          >
            <Play className={`w-3.5 h-3.5 mr-1.5 ${isRunningAll ? 'animate-spin' : ''}`} />
            {isRunningAll ? 'Running All 14 Scenarios...' : 'Run All 14 Scenarios'}
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-900 border border-slate-800 p-3 rounded-xl flex items-center justify-between">
          <div>
            <div className="text-[11px] text-slate-400 uppercase font-semibold">Total Scenarios</div>
            <div className="text-xl font-bold text-white font-mono">{total}</div>
          </div>
          <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-300">
            {total}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-3 rounded-xl flex items-center justify-between">
          <div>
            <div className="text-[11px] text-slate-400 uppercase font-semibold">Executed</div>
            <div className="text-xl font-bold text-cyan-400 font-mono">{ranCount} / {total}</div>
          </div>
          <div className="w-8 h-8 rounded-lg bg-cyan-950 border border-cyan-800 flex items-center justify-center text-cyan-400">
            <Clock className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-3 rounded-xl flex items-center justify-between">
          <div>
            <div className="text-[11px] text-slate-400 uppercase font-semibold">Passed</div>
            <div className="text-xl font-bold text-emerald-400 font-mono">{passCount}</div>
          </div>
          <div className="w-8 h-8 rounded-lg bg-emerald-950 border border-emerald-800 flex items-center justify-center text-emerald-400">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-3 rounded-xl flex items-center justify-between">
          <div>
            <div className="text-[11px] text-slate-400 uppercase font-semibold">Failed</div>
            <div className="text-xl font-bold text-red-400 font-mono">{failCount}</div>
          </div>
          <div className="w-8 h-8 rounded-lg bg-red-950 border border-red-800 flex items-center justify-center text-red-400">
            <XCircle className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Main Scenarios Table and Details */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Scenarios List */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-md flex flex-col h-[700px]">
          <div className="p-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-300">Test Scenarios Catalog</span>
            <div className="flex items-center space-x-1">
              <Filter className="w-3.5 h-3.5 text-slate-400 mr-1" />
              <button
                onClick={() => setFilterMode('all')}
                className={`px-2 py-0.5 rounded text-[11px] cursor-pointer ${
                  filterMode === 'all' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                All ({scenarios.length})
              </button>
              <button
                onClick={() => setFilterMode('passed')}
                className={`px-2 py-0.5 rounded text-[11px] cursor-pointer ${
                  filterMode === 'passed' ? 'bg-emerald-900 text-emerald-200' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Passed ({passCount})
              </button>
              <button
                onClick={() => setFilterMode('failed')}
                className={`px-2 py-0.5 rounded text-[11px] cursor-pointer ${
                  filterMode === 'failed' ? 'bg-red-900 text-red-200' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Failed ({failCount})
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/80 p-2 space-y-1">
            {filteredScenarios.map((sc) => {
              const res = results[sc.id];
              const isSelected = selectedResultId === sc.id;
              const isRunningThis = runningScenarioId === sc.id;

              return (
                <div
                  key={sc.id}
                  onClick={() => setSelectedResultId(sc.id)}
                  className={`p-3 rounded-lg transition cursor-pointer text-xs ${
                    isSelected
                      ? 'bg-slate-800/90 border border-emerald-500/40 shadow-sm'
                      : 'hover:bg-slate-800/40 border border-transparent'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center space-x-2">
                      <span className="font-mono font-bold text-slate-200 px-1.5 py-0.5 bg-slate-800 rounded">
                        {sc.id}
                      </span>
                      <span className="font-mono text-cyan-300 font-semibold">{sc.order_number}</span>
                      <span className="text-slate-300 font-medium">{sc.customer_name}</span>
                    </div>

                    <div className="flex items-center space-x-2">
                      {isRunningThis ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-cyan-950 text-cyan-300 border border-cyan-800 flex items-center font-mono">
                          <RotateCcw className="w-3 h-3 animate-spin mr-1" /> Running
                        </span>
                      ) : res ? (
                        res.passed ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800 flex items-center font-mono font-semibold">
                            <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-400" /> PASS
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] bg-red-950 text-red-300 border border-red-800 flex items-center font-mono font-semibold">
                            <XCircle className="w-3 h-3 mr-1 text-red-400" /> FAIL
                          </span>
                        )
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-800 text-slate-400 border border-slate-700 font-mono">
                          Not run
                        </span>
                      )}

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onRunSingle(sc.id);
                        }}
                        disabled={isRunningAll || runningScenarioId !== null}
                        className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[10px] font-medium transition cursor-pointer"
                        title="Run this scenario"
                      >
                        <Play className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-1.5 text-slate-300 font-medium text-[11px]">
                    {sc.title}
                  </div>

                  <div className="mt-1 text-[11px] text-slate-400 flex items-center space-x-1">
                    <span className="text-slate-500 font-semibold">Expect:</span>
                    <span>{sc.expected_outcome}</span>
                  </div>

                  {res && (
                    <div className="mt-1.5 pt-1.5 border-t border-slate-800/80 flex items-center justify-between text-[10px] font-mono">
                      <span className={res.passed ? 'text-emerald-400' : 'text-red-400'}>
                        {res.actual_outcome}
                      </span>
                      <span className="text-slate-500">{res.duration_ms}ms</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected Scenario Details & Audit Evidence */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-md flex flex-col h-[700px]">
          <div className="p-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-300">
              {selectedResultId ? `Scenario Inspection: ${selectedResultId}` : 'Scenario Evidence'}
            </span>
            {selectedResultId && (
              <button
                onClick={() => {
                  const sc = scenarios.find((s) => s.id === selectedResultId);
                  if (sc) onLoadScenarioToChat(sc);
                }}
                className="text-[11px] text-emerald-400 hover:text-emerald-300 flex items-center cursor-pointer"
              >
                <ExternalLink className="w-3 h-3 mr-1" />
                Test in Live Chat
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
            {!selectedResult ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 p-6">
                <Layers className="w-10 h-10 mb-2 opacity-30 text-slate-400" />
                <p>Select any scenario on the left or run all scenarios to inspect real execution logs, tool traces, and decision records.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Result Status Card */}
                <div
                  className={`p-3 rounded-lg border ${
                    selectedResult.passed
                      ? 'bg-emerald-950/30 border-emerald-800 text-emerald-300'
                      : 'bg-red-950/30 border-red-800 text-red-300'
                  }`}
                >
                  <div className="flex items-center justify-between font-mono font-bold">
                    <span className="flex items-center">
                      {selectedResult.passed ? (
                        <CheckCircle2 className="w-4 h-4 mr-1.5 text-emerald-400" />
                      ) : (
                        <XCircle className="w-4 h-4 mr-1.5 text-red-400" />
                      )}
                      {selectedResult.passed ? 'TEST PASSED' : 'TEST FAILED'}
                    </span>
                    <span className="text-[11px] text-slate-400">{selectedResult.duration_ms}ms</span>
                  </div>

                  <div className="mt-2 text-[11px] font-sans">
                    <div><strong>Expected:</strong> {selectedResult.expected_outcome}</div>
                    <div className="mt-1"><strong>Actual:</strong> {selectedResult.actual_outcome}</div>
                  </div>

                  {selectedResult.failed_checks.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-red-900/50 text-[11px] text-red-400 space-y-1">
                      <strong>Failed Checks:</strong>
                      <ul className="list-disc pl-4">
                        {selectedResult.failed_checks.map((fc, i) => (
                          <li key={i}>{fc}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {/* Conversation Transcript */}
                <div>
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                    Conversation Transcript
                  </h4>
                  <div className="space-y-2 bg-slate-950 p-3 rounded-lg border border-slate-800">
                    {selectedResult.transcript.map((msg, i) => (
                      <div
                        key={i}
                        className={`p-2 rounded text-xs ${
                          msg.sender === 'customer'
                            ? 'bg-blue-950/60 text-blue-200 border border-blue-900/50'
                            : 'bg-slate-900 text-slate-200 border border-slate-800'
                        }`}
                      >
                        <div className="text-[10px] font-bold uppercase mb-0.5 text-slate-400">
                          {msg.sender === 'customer' ? 'Customer' : 'H9loop Agent'}:
                        </div>
                        <div className="whitespace-pre-wrap">{msg.text}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Supporting Tool Calls */}
                <div>
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                    Supporting Tool Activity ({selectedResult.supporting_tool_calls.length})
                  </h4>
                  <div className="space-y-2">
                    {selectedResult.supporting_tool_calls.map((tc, idx) => (
                      <div key={idx} className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 font-mono text-[11px]">
                        <div className="flex items-center justify-between text-cyan-300 font-bold mb-1">
                          <span>{tc.tool_name}</span>
                          <span className="text-[10px] text-slate-500">{tc.duration_ms}ms</span>
                        </div>
                        <div className="text-[10px] text-slate-400">
                          Inputs: {JSON.stringify(tc.inputs)}
                        </div>
                        <div className="text-[10px] text-emerald-400 mt-1">
                          Output: {JSON.stringify(tc.output)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Final Case Block */}
                <div>
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                    Final Session Case Block
                  </h4>
                  <pre className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 font-mono text-[11px] text-purple-200 overflow-x-auto">
                    {JSON.stringify(selectedResult.final_case_block, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
