import React from 'react';
import {
  ShieldAlert,
  CheckCircle2,
  Code2,
  FileCode,
  Layers,
  Repeat,
  Compass,
  FileSpreadsheet,
  Lock,
} from 'lucide-react';

export const SevenMistakesView: React.FC = () => {
  const mistakes = [
    {
      num: 1,
      title: 'Vague Instructions',
      manifestation: 'Agent is told to "be careful" or "escalate when appropriate" without quantitative definitions.',
      fixSummary: 'Fixed via Global Instructions G1-G10 and hardcoded policies.csv rules with explicit boundaries: 14 calendar days against 2026-10-05 reference date, R5,000 approval limit, and R10,000 hard escalation ceiling.',
      codeFiveLines: [
        '1. G1-G10 define exact testable conditions for identity, verification, and limits.',
        '2. Date boundary comparison: diffInDays("2026-10-05", order.order_date) <= 14.',
        '3. Numerical limit check: if amount > 10000 -> hard escalation; if amount > 5000 -> human approval.',
        '4. Account status checks explicitly evaluate locked, suspended, and fraud_flag == 1.',
        '5. Tool code in check_refund_eligibility deterministically validates every policy rule.'
      ],
      icon: Compass,
      color: 'text-blue-400',
      bgColor: 'bg-blue-950/40 border-blue-800/80',
    },
    {
      num: 2,
      title: 'Blind Retry',
      manifestation: 'A failed refund or tool invocation is repeatedly called without diagnosing why it failed.',
      fixSummary: 'Fixed via Structured Error Handling (R1-R6) where every failure returns structured JSON (category, retryable, field, message). Retries are capped at 2 and only allowed when retryable=true.',
      codeFiveLines: [
        '1. Standard error schema: { is_error: true, category, retryable: boolean, field, message }.',
        '2. Validation and policy errors are marked retryable=false to prevent blind re-invocation.',
        '3. R4 & R6: Before executing process_refund, the system checks existing orders and refunds.',
        '4. Idempotency store caches transaction keys so duplicate clicks never re-run payments.',
        '5. Verification attempts are tracked and capped at 2 before escalating via G5.'
      ],
      icon: Repeat,
      color: 'text-amber-400',
      bgColor: 'bg-amber-950/40 border-amber-800/80',
    },
    {
      num: 3,
      title: 'Lossy Compression',
      manifestation: 'Important order numbers, customer IDs, or refund amounts get summarized away across chat turns.',
      fixSummary: 'Fixed via strict case_block state object preserved identically across all conversational turns without abbreviation or value muting.',
      codeFiveLines: [
        '1. Exact case_block schema: customer_id, order_number, product_id, amount_zar, refund_id, etc.',
        '2. Values are stored as typed primitives (null, number, boolean, string) instead of unstructured chat memory.',
        '3. Client-agent context carries the unmodified case_block across each HTTP request and response.',
        '4. Tool outputs update case_block directly without relying on LLM conversational recall.',
        '5. Verification status and remaining attempts are isolated per customer conversation.'
      ],
      icon: Layers,
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-950/40 border-emerald-800/80',
    },
    {
      num: 4,
      title: 'Free-Text Outputs',
      manifestation: 'Decisions and escalations are communicated solely in conversational English sentences.',
      fixSummary: 'Fixed via validated record_decision mechanism emitting machine-readable JSON on every transition while giving the customer a friendly human response.',
      codeFiveLines: [
        '1. record_decision schema: { action, rule_ids, customer_id, order_number, amount_zar, reason_code, needs_human_approval }.',
        '2. Enums restrict actions: ask_question, call_tool, confirm_refund, process_refund, decline, escalate, close.',
        '3. Machine decisions are appended to the context log and verified by automated test assertions.',
        '4. POPIA-safe audit entries are simultaneously mirrored to /h9loop_support/audit_trail/audit_log.jsonl.',
        '5. The customer receives plain-English responses while downstream workflows read structured JSON.'
      ],
      icon: FileCode,
      color: 'text-purple-400',
      bgColor: 'bg-purple-950/40 border-purple-800/80',
    },
    {
      num: 5,
      title: 'Wrong Tool Layer',
      manifestation: 'Unnecessary external network servers, microservices, or cloud endpoints called for local data operations.',
      fixSummary: 'Fixed via direct in-app TypeScript tools reading and writing local CSV files in data_work/ using native file I/O.',
      codeFiveLines: [
        '1. Six in-app tools: get_customer, lookup_order, verify_identity, check_refund_eligibility, process_refund, escalate_to_human.',
        '2. Tools execute in-process directly against local working CSV tables without remote network hops.',
        '3. Local CSV parser and serializer handles RFC4180 formats cleanly without external SaaS APIs.',
        '4. Instantaneous deterministic execution without third-party latency or external API key outages.',
        '5. Zero unnecessary cloud connectors or external web servers.'
      ],
      icon: Code2,
      color: 'text-cyan-400',
      bgColor: 'bg-cyan-950/40 border-cyan-800/80',
    },
    {
      num: 6,
      title: 'Wrong Scope',
      manifestation: 'Business rules and refund thresholds hardcoded into prompt instructions rather than shared data.',
      fixSummary: 'Fixed by designating policies.csv as the single source of truth, loaded dynamically and enforced directly in backend code.',
      codeFiveLines: [
        '1. policies.csv is loaded into memory as the authoritative database table of business rules.',
        '2. POL-01 through POL-13 rules are queried and mapped to reason codes during eligibility checks.',
        '3. Thresholds (threshold_zar = 5000, 10000) are read from policy definitions rather than prompt prompts.',
        '4. Reusable skill markdown files (skill-refund-eligibility.md, etc.) document procedural flows.',
        '5. Memory.md establishes shared escalation queues and POPIA compliance protocols.'
      ],
      icon: FileSpreadsheet,
      color: 'text-indigo-400',
      bgColor: 'bg-indigo-950/40 border-indigo-800/80',
    },
    {
      num: 7,
      title: 'Irreversible Actions',
      manifestation: 'Agent executes an irreversible refund without explicit confirmation or rollback safety.',
      fixSummary: 'Fixed via three-phase Inspect -> Approve -> Execute cycle, timestamped database backups before every write, and idempotency keys.',
      codeFiveLines: [
        '1. Phase 1 (Inspect): Verify identity and check eligibility without altering any database records.',
        '2. Phase 2 (Approve): Present exact order number and refund amount; wait for customer explicit agreement.',
        '3. Phase 3 (Execute): Require idempotency key to prevent accidental double-submits.',
        '4. createTimestampedBackup() takes an automated snapshot of data_work/ to /backups/ before any write.',
        '5. If transaction status is ever uncertain, agent escalates immediately instead of repeating the payment.'
      ],
      icon: Lock,
      color: 'text-rose-400',
      bgColor: 'bg-rose-950/40 border-rose-800/80',
    },
  ];

  return (
    <div className="space-y-4">
      {/* Overview Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-md">
        <h2 className="text-base font-bold text-white tracking-tight flex items-center">
          <ShieldAlert className="w-4 h-4 mr-2 text-emerald-400" />
          Seven-Mistakes Mitigation Implementation Matrix (Sections B & C)
        </h2>
        <p className="text-xs text-slate-400 mt-1 max-w-3xl">
          The table below demonstrates how each architectural antipattern from the specification was systematically eliminated in the codebase.
        </p>
      </div>

      {/* Mistakes Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {mistakes.map((m) => {
          const Icon = m.icon;
          return (
            <div
              key={m.num}
              className={`border rounded-xl p-4 shadow-md flex flex-col justify-between ${m.bgColor}`}
            >
              <div>
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <div className="flex items-center space-x-2">
                    <span className="w-6 h-6 rounded-md bg-slate-900 border border-slate-800 flex items-center justify-center font-mono font-bold text-xs text-slate-200">
                      {m.num}
                    </span>
                    <h3 className={`font-bold text-sm ${m.color}`}>{m.title}</h3>
                  </div>
                  <Icon className={`w-4 h-4 ${m.color}`} />
                </div>

                <div className="mt-3 space-y-2 text-xs">
                  <div>
                    <strong className="text-slate-400 uppercase text-[10px] tracking-wider block">
                      Antipattern / How It Shows Up:
                    </strong>
                    <p className="text-slate-300 mt-0.5">{m.manifestation}</p>
                  </div>

                  <div>
                    <strong className="text-slate-400 uppercase text-[10px] tracking-wider block">
                      Where & Why Version 2 Fixes It:
                    </strong>
                    <p className="text-slate-300 mt-0.5">{m.fixSummary}</p>
                  </div>

                  <div className="mt-3 pt-2 border-t border-slate-800/80">
                    <strong className="text-slate-400 uppercase text-[10px] tracking-wider block mb-1">
                      Code Implementation (5-Line Summary):
                    </strong>
                    <div className="space-y-1 font-mono text-[11px] text-slate-200 bg-slate-950/80 p-2.5 rounded-lg border border-slate-900">
                      {m.codeFiveLines.map((line, idx) => (
                        <div key={idx} className="leading-snug">{line}</div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
