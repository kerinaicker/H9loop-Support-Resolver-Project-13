import {
  Customer,
  Product,
  Order,
  Payment,
  Refund,
  SupportCase,
  Policy,
  StructuredError,
  ErrorCategory,
} from '../types/h9loop.ts';
import {
  readTable,
  writeTable,
  maskEmail,
  maskPhone,
  logAudit,
  saveEscalationDraft,
  WORK_DIR,
} from './h9loopDb.ts';

export const FIXED_REFERENCE_DATE = '2026-10-05';

export function makeError(
  category: ErrorCategory,
  message: string,
  field: string | null = null,
  retryable: boolean = false,
  retry_after_ms: number | null = null
): StructuredError {
  return {
    is_error: true,
    category,
    retryable,
    retry_after_ms,
    field,
    message,
  };
}

export function parseDate(dStr: string): Date {
  return new Date(`${dStr}T00:00:00Z`);
}

export function diffInDays(dateA: string, dateB: string): number {
  const msA = parseDate(dateA).getTime();
  const msB = parseDate(dateB).getTime();
  const diff = Math.round((msA - msB) / (1000 * 60 * 60 * 24));
  return diff;
}

// Global cache for idempotency keys
const idempotencyStore = new Map<string, any>();

/**
 * Tool 1: get_customer(customer_id)
 * Retrieves verified customer information, not orders.
 * G1 / G9 POPIA compliant: masks full phone numbers, never discloses passwords/card details.
 */
export function get_customer(
  customer_id: string,
  dataDir: string = WORK_DIR
): { customer: Omit<Customer, 'phone'> & { masked_phone: string } } | StructuredError {
  if (!customer_id || typeof customer_id !== 'string') {
    return makeError('validation', 'customer_id is required and must be a string', 'customer_id');
  }

  const customers = readTable<Customer>('customers', dataDir);
  const cust = customers.find((c) => c.customer_id.trim().toUpperCase() === customer_id.trim().toUpperCase());

  if (!cust) {
    return makeError('not_found', `Customer '${customer_id}' was not found in records`, 'customer_id');
  }

  const result = {
    customer: {
      customer_id: cust.customer_id,
      full_name: cust.full_name,
      email: cust.email,
      masked_phone: maskPhone(cust.phone) || '',
      city: cust.city,
      province: cust.province,
      client_type: cust.client_type,
      company: cust.company,
      membership_status: cust.membership_status,
      account_status: cust.account_status,
      fraud_flag: cust.fraud_flag,
      popia_marketing_consent: cust.popia_marketing_consent,
      verification_phone_last4: cust.verification_phone_last4,
      joined_date: cust.joined_date,
      open_cases: cust.open_cases,
    },
  };

  logAudit({
    event_type: 'TOOL_CALL',
    customer_id: cust.customer_id,
    masked_email: maskEmail(cust.email),
    phone_last4: cust.verification_phone_last4,
    order_number: null,
    details: { tool: 'get_customer', customer_id },
  });

  return result;
}

/**
 * Tool 2: lookup_order(order_number)
 * Retrieves order details, payments and existing refunds, but does not determine eligibility.
 */
export function lookup_order(
  order_number: string,
  dataDir: string = WORK_DIR
): {
  order: Order;
  product: Product | null;
  payments: Payment[];
  refunds: Refund[];
} | StructuredError {
  if (!order_number || typeof order_number !== 'string') {
    return makeError('validation', 'order_number is required', 'order_number');
  }

  const orders = readTable<Order>('orders', dataDir);
  const cleanOrderNum = order_number.trim().toUpperCase();
  const order = orders.find((o) => o.order_number.trim().toUpperCase() === cleanOrderNum);

  if (!order) {
    return makeError('not_found', `Order '${order_number}' was not found`, 'order_number');
  }

  const products = readTable<Product>('products', dataDir);
  const product = products.find((p) => p.product_id === order.product_id) || null;

  const payments = readTable<Payment>('payments', dataDir).filter(
    (p) => p.order_number.trim().toUpperCase() === cleanOrderNum
  );

  const refunds = readTable<Refund>('refunds', dataDir).filter(
    (r) => r.order_number.trim().toUpperCase() === cleanOrderNum
  );

  logAudit({
    event_type: 'TOOL_CALL',
    customer_id: order.customer_id,
    masked_email: null,
    phone_last4: null,
    order_number: order.order_number,
    details: { tool: 'lookup_order', order_number, paymentsCount: payments.length, refundsCount: refunds.length },
  });

  return {
    order,
    product,
    payments,
    refunds,
  };
}

/**
 * Tool 3: verify_identity(customer_id, email, phone_last4)
 * Checks the customer's identity and returns verification status.
 * Both email and last 4 digits of phone must match.
 */
export function verify_identity(
  customer_id: string,
  email: string,
  phone_last4: string,
  dataDir: string = WORK_DIR,
  currentAttemptsLeft: number = 2
): {
  verified: boolean;
  attempts_left: number;
  customer_id: string;
  matched_name?: string;
  message: string;
} | StructuredError {
  if (!customer_id || !email || !phone_last4) {
    return makeError(
      'validation',
      'customer_id, email, and phone_last4 are all required for verification',
      !customer_id ? 'customer_id' : !email ? 'email' : 'phone_last4'
    );
  }

  const customers = readTable<Customer>('customers', dataDir);
  const cust = customers.find((c) => c.customer_id.trim().toUpperCase() === customer_id.trim().toUpperCase());

  if (!cust) {
    return makeError('not_found', `Customer '${customer_id}' not found`, 'customer_id');
  }

  const emailMatch = cust.email.trim().toLowerCase() === email.trim().toLowerCase();
  const phoneMatch = cust.verification_phone_last4.trim() === phone_last4.trim();

  if (emailMatch && phoneMatch) {
    logAudit({
      event_type: 'VERIFICATION',
      customer_id: cust.customer_id,
      masked_email: maskEmail(cust.email),
      phone_last4: cust.verification_phone_last4,
      order_number: null,
      details: { verified: true, attempts_left: currentAttemptsLeft },
    });

    return {
      verified: true,
      attempts_left: currentAttemptsLeft,
      customer_id: cust.customer_id,
      matched_name: cust.full_name,
      message: 'Identity successfully verified against customer records.',
    };
  } else {
    const attemptsRemaining = Math.max(0, currentAttemptsLeft - 1);
    logAudit({
      event_type: 'VERIFICATION',
      customer_id: cust.customer_id,
      masked_email: maskEmail(email),
      phone_last4: phone_last4,
      order_number: null,
      details: {
        verified: false,
        attempts_left: attemptsRemaining,
        emailMatch,
        phoneMatch,
      },
    });

    return {
      verified: false,
      attempts_left: attemptsRemaining,
      customer_id: cust.customer_id,
      message:
        attemptsRemaining > 0
          ? `Verification failed. Email or phone last 4 digits did not match. ${attemptsRemaining} attempt remaining.`
          : 'Verification failed. Maximum attempts exhausted. Case must be escalated.',
    };
  }
}

/**
 * Tool 4: check_refund_eligibility(order_number, refund_type)
 * Checks refund eligibility without modifying records.
 * Enforces all policies in section 4 & policies.csv:
 * - 14-day window
 * - Non-refundable products (refundable = 0)
 * - Single refund rule
 * - Account status (fraud, locked, suspended)
 * - Threshold limits (> R5,000 human approval; > R10,000 hard escalation)
 * - Duplicate charges require 2 settled payments
 */
export function check_refund_eligibility(
  order_number: string,
  refund_type: string = 'standard',
  dataDir: string = WORK_DIR
): {
  eligible: boolean;
  reason_code: string;
  rule_id: string;
  requires_human_approval: boolean;
  escalate: boolean;
  target_queue?: string;
  refund_amount_zar: number;
  existing_refund_id?: string;
  message: string;
  days_elapsed?: number;
} | StructuredError {
  const orderLookup = lookup_order(order_number, dataDir);
  if ('is_error' in orderLookup) {
    return orderLookup;
  }

  const { order, product, payments, refunds } = orderLookup;

  // Retrieve customer to check account status & fraud
  const customers = readTable<Customer>('customers', dataDir);
  const cust = customers.find((c) => c.customer_id === order.customer_id);

  // POL-07: Fraud flag check
  if (cust && cust.fraud_flag === 1) {
    return {
      eligible: false,
      reason_code: 'FRAUD_FLAGGED',
      rule_id: 'POL-07',
      requires_human_approval: true,
      escalate: true,
      target_queue: 'Security',
      refund_amount_zar: order.amount_zar,
      message: 'Account security review required. Escalating to Security queue.',
    };
  }

  // POL-08: Locked or suspended account check
  if (cust && (cust.account_status === 'locked' || cust.account_status === 'suspended')) {
    return {
      eligible: false,
      reason_code: cust.account_status === 'locked' ? 'ACCOUNT_LOCKED' : 'ACCOUNT_SUSPENDED',
      rule_id: 'POL-08',
      requires_human_approval: true,
      escalate: true,
      target_queue: 'Account Recovery',
      refund_amount_zar: order.amount_zar,
      message: `Account is currently ${cust.account_status}. Escalating to Account Recovery.`,
    };
  }

  // POL-13: Partial refunds check
  if (refund_type === 'partial' || refund_type === 'partial_refund') {
    return {
      eligible: false,
      reason_code: 'PARTIAL_REFUND_ESCALATION',
      rule_id: 'POL-13',
      requires_human_approval: true,
      escalate: true,
      target_queue: 'Specialist Support',
      refund_amount_zar: order.amount_zar,
      message: 'Partial refunds cannot be processed automatically. Escalating to human specialist.',
    };
  }

  // POL-03: Single refund rule
  if (order.refund_status === 'refunded' || refunds.length > 0) {
    const existingRefId = refunds.length > 0 ? refunds[0].refund_id : 'RF700000';
    return {
      eligible: false,
      reason_code: 'ALREADY_REFUNDED',
      rule_id: 'POL-03',
      requires_human_approval: false,
      escalate: false,
      refund_amount_zar: 0,
      existing_refund_id: existingRefId,
      message: `This order has already been refunded under Refund ID ${existingRefId}. Multiple refunds are not permitted.`,
    };
  }

  // POL-02: Non-refundable products check
  if (product && product.refundable === 0) {
    return {
      eligible: false,
      reason_code: 'NON_REFUNDABLE_PRODUCT',
      rule_id: 'POL-02',
      requires_human_approval: false,
      escalate: false,
      refund_amount_zar: 0,
      message: `The product '${product.name}' is a digital download marked as non-refundable once delivered.`,
    };
  }

  // Duplicate charge handling (POL-09)
  if (refund_type === 'duplicate' || refund_type === 'duplicate_charge') {
    const settledPayments = payments.filter((p) => p.status === 'settled');
    if (settledPayments.length < 2) {
      return {
        eligible: false,
        reason_code: 'NO_DUPLICATE_PAYMENT',
        rule_id: 'POL-09',
        requires_human_approval: false,
        escalate: false,
        refund_amount_zar: 0,
        message: 'No duplicate settled payment found for this order in billing records.',
      };
    }
    const duplicatePayment = settledPayments[1];
    return {
      eligible: true,
      reason_code: 'DUPLICATE_CHARGE_ELIGIBLE',
      rule_id: 'POL-09',
      requires_human_approval: false,
      escalate: false,
      refund_amount_zar: duplicatePayment.amount_zar,
      message: `Duplicate charge of R${duplicatePayment.amount_zar.toLocaleString('en-ZA', {
        minimumFractionDigits: 2,
      })} confirmed. Eligible for immediate refund while maintaining active order enrollment.`,
    };
  }

  // Refund window check: Reference date is 2026-10-05
  const daysElapsed = diffInDays(FIXED_REFERENCE_DATE, order.order_date);

  // POL-06: Subscription renewals (20 days etc.)
  if (product && product.is_subscription === 1 && daysElapsed > 14) {
    return {
      eligible: false,
      reason_code: 'SUBSCRIPTION_WINDOW_EXPIRED',
      rule_id: 'POL-06',
      requires_human_approval: false,
      escalate: false,
      refund_amount_zar: 0,
      days_elapsed: daysElapsed,
      message: `Subscription renewals cannot be reversed after 14 days (order placed ${daysElapsed} days ago on ${order.order_date}).`,
    };
  }

  // POL-01: Refund window expired (> 14 days)
  if (daysElapsed > 14) {
    return {
      eligible: false,
      reason_code: 'WINDOW_EXPIRED',
      rule_id: 'POL-01',
      requires_human_approval: false,
      escalate: false,
      refund_amount_zar: 0,
      days_elapsed: daysElapsed,
      message: `The 14-day refund window for order ${order.order_number} expired on ${order.refund_window_ends} (${daysElapsed} days ago).`,
    };
  }

  // POL-05: Hard escalation limit (> R10,000)
  if (order.amount_zar > 10000) {
    return {
      eligible: false,
      reason_code: 'AMOUNT_EXCEEDS_HARD_LIMIT',
      rule_id: 'POL-05',
      requires_human_approval: true,
      escalate: true,
      target_queue: 'Finance / Approvals',
      refund_amount_zar: order.amount_zar,
      days_elapsed: daysElapsed,
      message: `Refund amount of R${order.amount_zar.toLocaleString('en-ZA', {
        minimumFractionDigits: 2,
      })} exceeds the R10,000 automatic limit and must be escalated to Finance.`,
    };
  }

  // POL-04: Refund approval limit (> R5,000 up to R10,000)
  if (order.amount_zar > 5000) {
    return {
      eligible: true,
      reason_code: 'AMOUNT_REQUIRES_APPROVAL',
      rule_id: 'POL-04',
      requires_human_approval: true,
      escalate: true,
      target_queue: 'Finance / Approvals',
      refund_amount_zar: order.amount_zar,
      days_elapsed: daysElapsed,
      message: `Refund amount of R${order.amount_zar.toLocaleString('en-ZA', {
        minimumFractionDigits: 2,
      })} exceeds R5,000 and requires human management approval before release.`,
    };
  }

  // Eligible within window (<= 14 days, <= R5,000)
  return {
    eligible: true,
    reason_code: 'ELIGIBLE_WITHIN_WINDOW',
    rule_id: 'POL-01',
    requires_human_approval: false,
    escalate: false,
    refund_amount_zar: order.amount_zar,
    days_elapsed: daysElapsed,
    message: `Order is within the 14-day window (day ${daysElapsed} of 14) and eligible for a full refund of R${order.amount_zar.toLocaleString(
      'en-ZA',
      { minimumFractionDigits: 2 }
    )}.`,
  };
}

/**
 * Tool 5: process_refund(order_number, refund_type, idempotency_key)
 * Processes approved refunds and prevents duplicate transactions.
 * Enforces:
 * - Eligibility check in code
 * - Threshold check (no automatic refunds > R5,000 or > R10,000)
 * - Idempotency key lookup
 * - Timestamped backup before writing
 * - Append to refunds table, update order status
 */
export function process_refund(
  order_number: string,
  refund_type: string = 'standard',
  idempotency_key: string,
  dataDir: string = WORK_DIR
): {
  status: 'completed';
  refund_id: string;
  order_number: string;
  amount_zar: number;
  processed_date: string;
  idempotency_key: string;
  message: string;
} | StructuredError {
  if (!order_number || !idempotency_key) {
    return makeError(
      'validation',
      'Both order_number and idempotency_key are required to process a refund',
      !order_number ? 'order_number' : 'idempotency_key'
    );
  }

  // Idempotency check: if key seen with matching order, return cached outcome
  if (idempotencyStore.has(idempotency_key)) {
    const cached = idempotencyStore.get(idempotency_key);
    if (cached.order_number === order_number) {
      return cached;
    }
  }

  // Enforce eligibility strictly in tool code
  const eligibility = check_refund_eligibility(order_number, refund_type, dataDir);
  if ('is_error' in eligibility) {
    return eligibility;
  }

  if (!eligibility.eligible) {
    return makeError(
      'policy',
      `Cannot process refund: ${eligibility.message} (${eligibility.reason_code})`,
      'order_number'
    );
  }

  if (eligibility.requires_human_approval || eligibility.escalate) {
    return makeError(
      'permission',
      `Cannot process refund: Amount of R${eligibility.refund_amount_zar} requires human authorization (${eligibility.reason_code})`,
      'amount_zar'
    );
  }

  // Load existing tables to update
  const orders = readTable<Order>('orders', dataDir);
  const orderIdx = orders.findIndex((o) => o.order_number.trim().toUpperCase() === order_number.trim().toUpperCase());
  if (orderIdx === -1) {
    return makeError('not_found', `Order ${order_number} not found`, 'order_number');
  }

  const existingRefunds = readTable<Refund>('refunds', dataDir);
  const refundId = `RF${700000 + existingRefunds.length + 1}`;
  const amountToRefund = eligibility.refund_amount_zar;

  // New refund record
  const newRefund: Refund = {
    refund_id: refundId,
    order_number: orders[orderIdx].order_number,
    amount_zar: amountToRefund,
    created_date: FIXED_REFERENCE_DATE,
    status: 'completed',
  };

  // Update order refund status
  if (refund_type === 'duplicate' || refund_type === 'duplicate_charge') {
    orders[orderIdx].notes = (orders[orderIdx].notes ? orders[orderIdx].notes + ' | ' : '') + `Duplicate payment of R${amountToRefund} refunded via ${refundId}`;
    // Original enrollment remains active
  } else {
    orders[orderIdx].refund_status = 'refunded';
  }

  // Write with backup
  existingRefunds.push(newRefund);
  writeTable('refunds', existingRefunds, dataDir);
  writeTable('orders', orders, dataDir);

  const result = {
    status: 'completed' as const,
    refund_id: refundId,
    order_number: orders[orderIdx].order_number,
    amount_zar: amountToRefund,
    processed_date: FIXED_REFERENCE_DATE,
    idempotency_key,
    message: `Refund ${refundId} of R${amountToRefund.toLocaleString('en-ZA', {
      minimumFractionDigits: 2,
    })} processed successfully.`,
  };

  // Store in idempotency store
  idempotencyStore.set(idempotency_key, result);

  logAudit({
    event_type: 'REFUND_EXECUTED',
    customer_id: orders[orderIdx].customer_id,
    masked_email: null,
    phone_last4: null,
    order_number: orders[orderIdx].order_number,
    details: { refund_id: refundId, amount_zar: amountToRefund, idempotency_key },
  });

  return result;
}

/**
 * Tool 6: escalate_to_human(reason_code, customer_id, order_number, summary)
 * Creates a support case for human review.
 */
export function escalate_to_human(
  reason_code: string,
  customer_id: string,
  order_number: string | null,
  summary: string,
  dataDir: string = WORK_DIR
): {
  case_number: string;
  status: 'escalated';
  queue: string;
  customer_id: string;
  order_number: string | null;
  opened_date: string;
  summary: string;
} | StructuredError {
  if (!reason_code || !customer_id || !summary) {
    return makeError(
      'validation',
      'reason_code, customer_id, and summary are required for escalation',
      !reason_code ? 'reason_code' : !customer_id ? 'customer_id' : 'summary'
    );
  }

  const cases = readTable<SupportCase>('support_cases', dataDir);
  const customers = readTable<Customer>('customers', dataDir);

  const custIdx = customers.findIndex((c) => c.customer_id.trim().toUpperCase() === customer_id.trim().toUpperCase());
  if (custIdx === -1) {
    return makeError('not_found', `Customer ${customer_id} not found`, 'customer_id');
  }

  let queue = 'Customer Support';
  let category = 'other';

  if (reason_code.includes('FRAUD') || reason_code.includes('SECURITY')) {
    queue = 'Security';
    category = 'account';
  } else if (reason_code.includes('LOCK') || reason_code.includes('SUSPEND') || reason_code.includes('RECOVERY')) {
    queue = 'Account Recovery';
    category = 'account';
  } else if (reason_code.includes('AMOUNT') || reason_code.includes('APPROVAL') || reason_code.includes('FINANCE')) {
    queue = 'Finance / Approvals';
    category = 'refund';
  } else if (reason_code.includes('ACCESS') || reason_code.includes('PENDING_ACCESS')) {
    queue = 'Technical Delivery';
    category = 'access';
  } else if (reason_code.includes('PARTIAL') || reason_code.includes('SPECIALIST')) {
    queue = 'Specialist Support';
    category = 'refund';
  }

  const caseNumber = `CS-${20000 + cases.length + 1}`;
  const newCase: SupportCase = {
    case_number: caseNumber,
    customer_id: customers[custIdx].customer_id,
    opened_date: FIXED_REFERENCE_DATE,
    category,
    status: 'open',
    summary,
  };

  // Update customer's open cases
  customers[custIdx].open_cases = (customers[custIdx].open_cases || 0) + 1;

  // Persist with backup
  cases.push(newCase);
  writeTable('support_cases', cases, dataDir);
  writeTable('customers', customers, dataDir);

  // Write escalation draft
  saveEscalationDraft(caseNumber, {
    case_number: caseNumber,
    customer_id: customers[custIdx].customer_id,
    customer_name: customers[custIdx].full_name,
    order_number,
    reason_code,
    queue,
    opened_date: FIXED_REFERENCE_DATE,
    summary,
  });

  logAudit({
    event_type: 'ESCALATION',
    customer_id: customers[custIdx].customer_id,
    masked_email: maskEmail(customers[custIdx].email),
    phone_last4: customers[custIdx].verification_phone_last4,
    order_number,
    details: { case_number: caseNumber, queue, reason_code, summary },
  });

  return {
    case_number: caseNumber,
    status: 'escalated',
    queue,
    customer_id: customers[custIdx].customer_id,
    order_number,
    opened_date: FIXED_REFERENCE_DATE,
    summary,
  };
}
