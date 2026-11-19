import {
  ScenarioDefinition,
  ScenarioTestResult,
  StructuredDecision,
  ToolCallRecord,
  CaseBlock,
  Refund,
} from '../types/h9loop.ts';
import {
  createInitialContext,
  handleCustomerMessage,
  AgentContext,
} from './agentResolver.ts';
import {
  resetWorkDatabase,
  TEST_DIR,
  readTable,
} from './h9loopDb.ts';
import { SCENARIO_DEFINITIONS } from '../data/scenarios.ts';

export { SCENARIO_DEFINITIONS };
export type { ScenarioTestResult };

/**
 * Execute a single test scenario against clean test copy of database
 */
export async function runSingleScenario(
  scenario: ScenarioDefinition,
  targetDir: string = TEST_DIR
): Promise<ScenarioTestResult> {
  const startTime = Date.now();
  const transcript: { sender: 'customer' | 'agent'; text: string }[] = [];
  const failed_checks: string[] = [];

  // 1. Reset test database to original state before each scenario!
  resetWorkDatabase(targetDir);

  const context = createInitialContext(targetDir);

  // 2. Initial customer request
  transcript.push({ sender: 'customer', text: scenario.customer_request });
  const resp1 = await handleCustomerMessage(scenario.customer_request, context);
  transcript.push({ sender: 'agent', text: resp1.reply });

  // 3. If agent asks for confirmation (Inspect -> Approve -> Execute cycle in S1, S12, S13)
  if (resp1.last_decision.action === 'confirm_refund' && scenario.expected_action !== 'confirm_refund') {
    const confirmMessage = 'Yes, I explicitly agree to the refund amount and order details. Please proceed.';
    transcript.push({ sender: 'customer', text: confirmMessage });
    const resp2 = await handleCustomerMessage(confirmMessage, context);
    transcript.push({ sender: 'agent', text: resp2.reply });
  }

  // 4. Validate results against specification
  const lastDecision = context.decisions[context.decisions.length - 1];
  const allDecisions = context.decisions;
  const toolCalls = context.tool_calls;
  const caseBlock = context.case_block;

  // Check 1: Did agent record decision?
  if (!lastDecision) {
    failed_checks.push('No decision record was produced.');
  }

  // Check 2: Action match
  if (lastDecision && lastDecision.action !== scenario.expected_action) {
    failed_checks.push(
      `Expected action '${scenario.expected_action}', but got '${lastDecision.action}'`
    );
  }

  // Check 3: Reason code match if specified
  if (scenario.expected_reason_code) {
    const hasReason = allDecisions.some(
      (d) => d.reason_code === scenario.expected_reason_code
    );
    if (!hasReason) {
      failed_checks.push(
        `Expected reason_code '${scenario.expected_reason_code}', but got '${lastDecision?.reason_code}'`
      );
    }
  }

  // Specific check for S7 (Fraud): Fraud flag must NOT be revealed in transcript (POPIA / POL-07)
  if (scenario.id === 'S7') {
    const fullAgentText = transcript
      .filter((t) => t.sender === 'agent')
      .map((t) => t.text)
      .join(' ')
      .toLowerCase();
    if (fullAgentText.includes('fraud')) {
      failed_checks.push('POPIA Violation: Internal fraud flag was revealed to the customer!');
    }
  }

  // Specific check for S9: Must quote existing refund ID
  if (scenario.id === 'S9') {
    const fullAgentText = transcript
      .filter((t) => t.sender === 'agent')
      .map((t) => t.text)
      .join(' ');
    if (!fullAgentText.includes('RF700000')) {
      failed_checks.push('Expected agent to quote existing refund ID RF700000 in response.');
    }
  }

  // Check actual refunds table in test database
  const refundsInDb = readTable<Refund>('refunds', targetDir).filter(
    (r) => r.order_number === scenario.order_number
  );

  if (scenario.expected_refund_status === 'processed') {
    if (refundsInDb.length === 0) {
      failed_checks.push('Expected refund record in database, but none was written.');
    }
    if (!caseBlock.refund_id) {
      failed_checks.push('Expected refund_id in case_block, but it was null.');
    }
  } else if (
    scenario.expected_refund_status === 'declined' ||
    scenario.expected_refund_status === 'escalated'
  ) {
    // For S9, there was an initial refund before, but no NEW refund should have been added
    if (scenario.id !== 'S9' && refundsInDb.length > 0) {
      failed_checks.push('Refund was processed in database when it should NOT have been.');
    }
  }

  const passed = failed_checks.length === 0;
  const actual_outcome = lastDecision
    ? `Action: ${lastDecision.action} (${lastDecision.reason_code || 'N/A'})${
        caseBlock.refund_id ? ` - Refund ID: ${caseBlock.refund_id}` : ''
      }${caseBlock.case_number ? ` - Case: ${caseBlock.case_number}` : ''}`
    : 'No decision produced';

  return {
    scenario_id: scenario.id,
    order_number: scenario.order_number,
    customer_name: scenario.customer_name,
    passed,
    expected_outcome: scenario.expected_outcome,
    actual_outcome,
    failed_checks,
    supporting_tool_calls: toolCalls,
    decisions: allDecisions,
    final_case_block: caseBlock,
    transcript,
    duration_ms: Date.now() - startTime,
  };
}

/**
 * Run all 14 scenarios sequentially with database reset before each
 */
export async function runAllScenarios(
  targetDir: string = TEST_DIR
): Promise<ScenarioTestResult[]> {
  const results: ScenarioTestResult[] = [];
  for (const sc of SCENARIO_DEFINITIONS) {
    const res = await runSingleScenario(sc, targetDir);
    results.push(res);
  }
  return results;
}
