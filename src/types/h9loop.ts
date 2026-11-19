export interface Customer {
  customer_id: string;
  full_name: string;
  email: string;
  phone: string;
  city: string;
  province: string;
  client_type: string;
  company: string;
  membership_status: string;
  account_status: string;
  fraud_flag: number;
  popia_marketing_consent: number;
  verification_phone_last4: string;
  joined_date: string;
  open_cases: number;
}

export interface Product {
  product_id: string;
  name: string;
  category: string;
  price_zar: number;
  is_digital: number;
  is_subscription: number;
  refundable: number;
}

export interface Order {
  order_number: string;
  customer_id: string;
  product_id: string;
  order_date: string;
  amount_zar: number;
  delivery_status: string;
  delivery_date: string;
  refund_window_ends: string;
  payment_method: string;
  refund_status: string;
  notes: string;
}

export interface Payment {
  transaction_id: string;
  order_number: string;
  customer_id: string;
  amount_zar: number;
  payment_date: string;
  status: string;
  method: string;
}

export interface Refund {
  refund_id: string;
  order_number: string;
  amount_zar: number;
  created_date: string;
  status: string;
}

export interface SupportCase {
  case_number: string;
  customer_id: string;
  opened_date: string;
  category: string;
  status: string;
  summary: string;
}

export interface Policy {
  policy_id: string;
  topic: string;
  rule_text: string;
  threshold_zar: number | null;
  escalate: number;
}

export interface CaseBlock {
  customer_id: string | null;
  order_number: string | null;
  product_id: string | null;
  amount_zar: number | null;
  order_date: string | null;
  refund_type: string | null;
  refund_id: string | null;
  case_number: string | null;
  verified: boolean;
  attempts_left: number | null;
}

export type ErrorCategory =
  | 'validation'
  | 'not_found'
  | 'permission'
  | 'policy'
  | 'timeout'
  | 'unavailable';

export interface StructuredError {
  is_error: true;
  category: ErrorCategory;
  retryable: boolean;
  retry_after_ms: number | null;
  field: string | null;
  message: string;
}

export type DecisionAction =
  | 'ask_question'
  | 'call_tool'
  | 'confirm_refund'
  | 'process_refund'
  | 'decline'
  | 'escalate'
  | 'close';

export interface StructuredDecision {
  action: DecisionAction;
  rule_ids: string[];
  customer_id: string | null;
  order_number: string | null;
  amount_zar: number | null;
  reason_code: string | null;
  needs_human_approval: boolean;
  timestamp?: string;
}

export interface ToolCallRecord {
  id: string;
  tool_name: string;
  inputs: Record<string, unknown>;
  output: unknown;
  timestamp: string;
  duration_ms: number;
}

export interface AuditLogEntry {
  log_id: string;
  timestamp: string;
  event_type: 'VERIFICATION' | 'TOOL_CALL' | 'DECISION' | 'REFUND_EXECUTED' | 'ESCALATION' | 'DATA_BACKUP';
  customer_id: string | null;
  masked_email: string | null;
  phone_last4: string | null;
  order_number: string | null;
  details: Record<string, unknown>;
}

export interface ScenarioDefinition {
  id: string;
  order_number: string;
  customer_name: string;
  customer_email: string;
  phone_last4: string;
  title: string;
  customer_request: string;
  expected_outcome: string;
  expected_action: DecisionAction;
  expected_reason_code?: string;
  expected_refund_status?: 'processed' | 'declined' | 'escalated';
}

export interface AgentContext {
  case_block: CaseBlock;
  decisions: StructuredDecision[];
  tool_calls: ToolCallRecord[];
  conversation_ended: boolean;
  user_confirmed_refund: boolean;
  dataDir: string;
  provided_email?: string | null;
  provided_phone_last4?: string | null;
  conversation_history?: { sender: 'customer' | 'agent'; text: string; timestamp?: string }[];
  intent?: string | null;
}

export interface AgentResponse {
  reply: string;
  context: AgentContext;
  last_decision: StructuredDecision;
  tool_calls_made: ToolCallRecord[];
}

export interface ScenarioTestResult {
  scenario_id: string;
  order_number: string;
  customer_name: string;
  passed: boolean;
  expected_outcome: string;
  actual_outcome: string;
  failed_checks: string[];
  supporting_tool_calls: ToolCallRecord[];
  decisions: StructuredDecision[];
  final_case_block: CaseBlock;
  transcript: { sender: 'customer' | 'agent'; text: string }[];
  duration_ms: number;
}
