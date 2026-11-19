import React, { useState } from 'react';
import {
  CaseBlock,
  StructuredDecision,
  ToolCallRecord,
} from '../types/h9loop.ts';
import {
  Cpu,
  Layers,
  Wrench,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Clock,
  Shield,
  Tag,
} from 'lucide-react';

interface SidePanelProps {
  caseBlock: CaseBlock;
  decisions: StructuredDecision[];
  toolCalls: ToolCallRecord[];
}

export const SidePanel: React.FC<SidePanelProps> = ({
  caseBlock,
  decisions,
  toolCalls,
}) => {
  const [activeSection, setActiveSection] = useState<'case' | 'tools' | 'decisions'>('case');
  const [expandedToolId, setExpandedToolId] = useState<string | null>(null);
  const [expandedDecisionIdx, setExpandedDecisionIdx] = useState<number | null>(null);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col h-[700px] shadow-lg">
      {/* Panel Tabs */}
      <div className="bg-slate-950/80 border-b border-slate-800 p-2 flex space-x-1">
        <button
          onClick={() => setActiveSection('case')}
          className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center transition cursor-pointer ${
            activeSection === 'case'
              ? 'bg-slate-800 text-emerald-400 border border-emerald-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <Layers className="w-3.5 h-3.5 mr-1.5" />
          Case Block ({caseBlock.order_number || 'Empty'})
        </button>

        <button
          onClick={() => setActiveSection('tools')}
          className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center transition cursor-pointer ${
            activeSection === 'tools'
              ? 'bg-slate-800 text-cyan-400 border border-cyan-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <Wrench className="w-3.5 h-3.5 mr-1.5" />
          Tool Calls ({toolCalls.length})
        </button>

        <button
          onClick={() => setActiveSection('decisions')}
          className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center transition cursor-pointer ${
            activeSection === 'decisions'
              ? 'bg-slate-800 text-purple-400 border border-purple-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <Cpu className="w-3.5 h-3.5 mr-1.5" />
          Decisions ({decisions.length})
        </button>
      </div>

      {/* Panel Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* SECTION 1: Current Case Block */}
        {activeSection === 'case' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center">
                <Shield className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />
                Active Session Case Block
              </span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded font-mono font-medium ${
                  caseBlock.verified
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                    : 'bg-amber-950 text-amber-300 border border-amber-800'
                }`}
              >
                {caseBlock.verified ? 'Verified Identity' : 'Unverified'}
              </span>
            </div>

            <div className="bg-slate-950/90 rounded-lg p-3 border border-slate-800/80 font-mono text-xs space-y-2">
              <div className="flex justify-between items-center py-1 border-b border-slate-900">
                <span className="text-slate-500">customer_id:</span>
                <span className="text-slate-200 font-semibold">{caseBlock.customer_id || 'null'}</span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-slate-900">
                <span className="text-slate-500">order_number:</span>
                <span className="text-cyan-300 font-bold">{caseBlock.order_number || 'null'}</span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-slate-900">
                <span className="text-slate-500">product_id:</span>
                <span className="text-slate-300">{caseBlock.product_id || 'null'}</span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-slate-900">
                <span className="text-slate-500">amount_zar:</span>
                <span className="text-emerald-400 font-semibold">
                  {caseBlock.amount_zar !== null
                    ? `R${caseBlock.amount_zar.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`
                    : 'null'}
                </span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-slate-900">
                <span className="text-slate-500">order_date:</span>
                <span className="text-slate-300">{caseBlock.order_date || 'null'}</span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-slate-900">
                <span className="text-slate-500">refund_type:</span>
                <span className="text-slate-300">{caseBlock.refund_type || 'null'}</span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-slate-900">
                <span className="text-slate-500">refund_id:</span>
                <span className="text-emerald-300 font-bold">{caseBlock.refund_id || 'null'}</span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-slate-900">
                <span className="text-slate-500">case_number:</span>
                <span className="text-amber-300 font-bold">{caseBlock.case_number || 'null'}</span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-slate-900">
                <span className="text-slate-500">verified:</span>
                <span className={caseBlock.verified ? 'text-emerald-400' : 'text-slate-400'}>
                  {String(caseBlock.verified)}
                </span>
              </div>

              <div className="flex justify-between items-center py-1">
                <span className="text-slate-500">attempts_left:</span>
                <span className="text-slate-300">{caseBlock.attempts_left ?? 'null'}</span>
              </div>
            </div>

            <div className="text-[11px] text-slate-400 bg-slate-800/40 p-2.5 rounded-lg border border-slate-800">
              <strong className="text-slate-300">Section 2 Preservation Rule:</strong> The case block is preserved without summarising or modifying keys across all conversational turns.
            </div>
          </div>
        )}

        {/* SECTION 2: Tool Calls History */}
        {activeSection === 'tools' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Executed Tools ({toolCalls.length})
              </span>
              <span className="text-[10px] text-slate-400 font-mono">Real In-App Backend</span>
            </div>

            {toolCalls.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-xs">
                No tool calls executed yet. Start a chat or run a scenario.
              </div>
            ) : (
              toolCalls.map((tc, idx) => {
                const isExpanded = expandedToolId === tc.id || (expandedToolId === null && idx === toolCalls.length - 1);
                const hasError = tc.output && typeof tc.output === 'object' && 'is_error' in tc.output;

                return (
                  <div
                    key={tc.id || idx}
                    className="border border-slate-800 rounded-lg overflow-hidden bg-slate-950/60"
                  >
                    <button
                      onClick={() => setExpandedToolId(isExpanded ? '' : tc.id)}
                      className="w-full text-left p-2.5 bg-slate-900/80 hover:bg-slate-800/80 flex items-center justify-between transition cursor-pointer text-xs"
                    >
                      <div className="flex items-center space-x-2">
                        {isExpanded ? (
                          <ChevronDown className="w-3.5 h-3.5 text-cyan-400" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                        )}
                        <span className="font-mono font-bold text-cyan-300">{tc.tool_name}</span>
                        {hasError ? (
                          <span className="px-1.5 py-0.2 rounded text-[10px] bg-red-950 text-red-400 border border-red-800">
                            Error
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.2 rounded text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-800">
                            Success
                          </span>
                        )}
                      </div>
                      <div className="flex items-center text-[10px] text-slate-400 font-mono">
                        <Clock className="w-3 h-3 mr-1" />
                        {tc.duration_ms}ms
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="p-3 text-[11px] font-mono space-y-2 border-t border-slate-800 bg-slate-950">
                        <div>
                          <div className="text-slate-500 text-[10px] uppercase font-sans font-semibold mb-1">
                            Inputs:
                          </div>
                          <pre className="p-2 rounded bg-slate-900 text-slate-200 overflow-x-auto text-[11px]">
                            {JSON.stringify(tc.inputs, null, 2)}
                          </pre>
                        </div>

                        <div>
                          <div className="text-slate-500 text-[10px] uppercase font-sans font-semibold mb-1">
                            Output:
                          </div>
                          <pre
                            className={`p-2 rounded overflow-x-auto text-[11px] ${
                              hasError ? 'bg-red-950/40 text-red-200 border border-red-900/50' : 'bg-slate-900 text-emerald-300'
                            }`}
                          >
                            {JSON.stringify(tc.output, null, 2)}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* SECTION 3: Structured Decision Records */}
        {activeSection === 'decisions' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Machine-Readable Decisions ({decisions.length})
              </span>
              <span className="text-[10px] text-purple-400 font-mono">record_decision</span>
            </div>

            {decisions.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-xs">
                No decision records created yet.
              </div>
            ) : (
              decisions.map((dec, idx) => {
                const isExpanded = expandedDecisionIdx === idx || (expandedDecisionIdx === null && idx === decisions.length - 1);

                return (
                  <div
                    key={idx}
                    className="border border-slate-800 rounded-lg overflow-hidden bg-slate-950/60"
                  >
                    <button
                      onClick={() => setExpandedDecisionIdx(isExpanded ? null : idx)}
                      className="w-full text-left p-2.5 bg-slate-900/80 hover:bg-slate-800/80 flex items-center justify-between transition cursor-pointer text-xs"
                    >
                      <div className="flex items-center space-x-2">
                        {isExpanded ? (
                          <ChevronDown className="w-3.5 h-3.5 text-purple-400" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                        )}
                        <span className="font-mono font-bold text-purple-300">{dec.action}</span>
                        {dec.reason_code && (
                          <span className="text-[10px] text-slate-400 font-mono truncate max-w-[130px]">
                            {dec.reason_code}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center space-x-1.5">
                        {dec.needs_human_approval && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800">
                            Human Approval
                          </span>
                        )}
                        <span className="text-[10px] text-slate-500 font-mono">#{idx + 1}</span>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="p-3 text-[11px] font-mono space-y-2 border-t border-slate-800 bg-slate-950">
                        <div className="grid grid-cols-2 gap-2 text-[10px]">
                          <div>
                            <span className="text-slate-500">Action:</span>{' '}
                            <span className="text-purple-300 font-bold">{dec.action}</span>
                          </div>
                          <div>
                            <span className="text-slate-500">Reason:</span>{' '}
                            <span className="text-slate-300">{dec.reason_code || 'null'}</span>
                          </div>
                          <div>
                            <span className="text-slate-500">Amount ZAR:</span>{' '}
                            <span className="text-emerald-400">
                              {dec.amount_zar !== null ? `R${dec.amount_zar}` : 'null'}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-500">Rules Applied:</span>{' '}
                            <span className="text-cyan-300">{dec.rule_ids.join(', ') || 'None'}</span>
                          </div>
                        </div>

                        <div>
                          <div className="text-slate-500 text-[10px] uppercase font-sans font-semibold mb-1">
                            Exact JSON Payload:
                          </div>
                          <pre className="p-2 rounded bg-slate-900 text-purple-200 overflow-x-auto text-[11px]">
                            {JSON.stringify(dec, null, 2)}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
};
