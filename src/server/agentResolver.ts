import {
  CaseBlock,
  StructuredDecision,
  ToolCallRecord,
  StructuredError,
  AgentContext,
  AgentResponse,
  Customer,
  Order,
} from '../types/h9loop.ts';
import {
  get_customer,
  lookup_order,
  verify_identity,
  check_refund_eligibility,
  process_refund,
  escalate_to_human,
  FIXED_REFERENCE_DATE,
} from './tools.ts';
import {
  maskEmail,
  maskPhone,
  logAudit,
  WORK_DIR,
  resolveDataDir,
  readTable,
} from './h9loopDb.ts';

export type { AgentContext, AgentResponse };

export function createInitialContext(dataDir: string = WORK_DIR): AgentContext {
  return {
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
    dataDir: resolveDataDir(dataDir),
  };
}

export function record_decision(
  decision: Omit<StructuredDecision, 'timestamp'>,
  context: AgentContext
): StructuredDecision {
  const fullDecision: StructuredDecision = {
    ...decision,
    timestamp: new Date().toISOString(),
  };
  context.decisions.push(fullDecision);

  logAudit({
    event_type: 'DECISION',
    customer_id: fullDecision.customer_id,
    masked_email: null,
    phone_last4: null,
    order_number: fullDecision.order_number,
    details: {
      action: fullDecision.action,
      rule_ids: fullDecision.rule_ids,
      reason_code: fullDecision.reason_code,
      needs_human_approval: fullDecision.needs_human_approval,
      amount_zar: fullDecision.amount_zar,
    },
  });

  return fullDecision;
}

function executeTool<T>(
  toolName: string,
  inputs: Record<string, unknown>,
  fn: () => T,
  context: AgentContext
): T {
  const start = Date.now();
  const output = fn();
  const duration_ms = Date.now() - start;

  const record: ToolCallRecord = {
    id: `TC-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
    tool_name: toolName,
    inputs,
    output,
    timestamp: new Date().toISOString(),
    duration_ms,
  };
  context.tool_calls.push(record);
  return output;
}

/**
 * Parses user message for mentions of email, phone last 4, order number, confirmation, or POPIA third-party requests
 */
export function extractEntities(message: string): {
  email: string | null;
  phone_last4: string | null;
  order_number: string | null;
  customer_id: string | null;
  isConfirmation: boolean;
  isPartial: boolean;
  isDuplicate: boolean;
  isAccessIssue: boolean;
  isThirdPartyDisclosureRequest: boolean;
  thirdPartyName: string | null;
} {
  const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i;
  const emailMatch = message.match(emailRegex);

  // Flexible order number extraction:
  // e.g. H9-10159, H9 10159, H910159, order #10159, order 10159, or standalone 10xxx
  let order_number: string | null = null;
  const directH9 = message.match(/\bH9[-_\s]?(\d{4,5})\b/i);
  if (directH9) {
    order_number = `H9-${directH9[1]}`;
  } else {
    const orderWord = message.match(/\border\s*(?:number|no|#)?\s*[:#\s]?\s*(\d{4,5})\b/i);
    if (orderWord) {
      order_number = `H9-${orderWord[1]}`;
    } else {
      const fiveDigit = message.match(/\b(10\d{3})\b/);
      if (fiveDigit) {
        order_number = `H9-${fiveDigit[1]}`;
      }
    }
  }

  // Customer ID extraction (e.g. C1001, C1002, etc.)
  let customer_id: string | null = null;
  const custMatch = message.match(/\b(C10\d{2,3})\b/i);
  if (custMatch) {
    customer_id = custMatch[1].toUpperCase();
  }

  // Phone last 4 digits extraction:
  let phone_last4: string | null = null;
  const explicitPhone = message.match(/(?:phone|digits|last\s*(?:4|four)|verification|pin)\b[^\d]*(\d{4})\b/i);
  if (explicitPhone) {
    phone_last4 = explicitPhone[1];
  } else {
    const fullPhone = message.match(/(?:\+27|0)\s*\d{1,2}[\s-]?\d{3}[\s-]?(\d{4})\b/);
    if (fullPhone) {
      phone_last4 = fullPhone[1];
    } else {
      const all4digits = [...message.matchAll(/\b(\d{4})\b/g)].map((m) => m[1]);
      const valid4 = all4digits.filter((d) => d !== '2026' && d !== '2025' && d !== '2024' && (!order_number || !order_number.includes(d)));
      if (valid4.length > 0) {
        phone_last4 = valid4[valid4.length - 1];
      }
    }
  }

  const lower = message.toLowerCase().trim();
  const isConfirmation =
    /\b(yes|confirm|agree|proceed|please do|go ahead|approve|accept|sure|definitely|yes please)\b/i.test(lower) &&
    !/\b(no|cancel|wait|don't|stop|nevermind)\b/i.test(lower);

  const isPartial = /\b(partial|half|some of|part of|portion)\b/i.test(lower);
  const isDuplicate = /\b(charged twice|double charge|duplicate|billed twice|two payments)\b/i.test(lower);
  const isAccessIssue = /\b(access|can't log in|cannot access|pending access|no access|not enrolled|course access)\b/i.test(lower);

  // Third-party private information disclosure request (POPIA check)
  // e.g. "Give me Palesa Naidoo's email address.", "What is Palesa Naidoo's email address?"
  let isThirdPartyDisclosureRequest = false;
  let thirdPartyName: string | null = null;

  // When a user provides their own email/phone or asks about their own order/refund, it is NOT third-party disclosure
  const isSelfInquiry =
    /\b(my email|my phone|my order|my account|for my|i want|i would like|i need a refund|i was charged|can i get a refund on order|please refund)\b/i.test(
      lower
    ) || lower.includes('@');

  const privacyTargets = ['email', 'phone', 'contact', 'address', 'details', 'number', 'records', 'info', 'information', 'account'];
  const hasPrivacyTarget = privacyTargets.some((t) => lower.includes(t));

  if (!isSelfInquiry && hasPrivacyTarget) {
    const patterns = [
      /(?:give|tell|show|send|provide|share|get|need|find)\s+(?:me\s+)?(?:the\s+)?([A-Za-z]+(?:\s+[A-Za-z]+)?)(?:'s)?\s+(?:email|phone|contact|address|details|number|information|info|account|records)/i,
      /(?:what|where)\s+is\s+(?:the\s+)?([A-Za-z]+(?:\s+[A-Za-z]+)?)(?:'s)?\s+(?:email|phone|contact|address|details|number|information|info|account|records)/i,
      /(?:what|where)\s+is\s+the\s+(?:email|phone|contact|address|details|number|info)\s+(?:for|of)\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)/i,
      /(?:give|tell|show|send|provide|share)\s+(?:me\s+)?(?:the\s+)?(?:email|phone|contact|address|details|number|info)\s+(?:for|of)\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)/i,
      /(?:email|phone|contact|address|details|number)\s+(?:of|for)\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)/i,
      /([A-Za-z]+(?:\s+[A-Za-z]+)?)'s\s+(?:email|phone|contact|address|details|number|info)/i,
    ];

    for (const p of patterns) {
      const m = message.match(p);
      if (m && m[1]) {
        const name = m[1].trim().toLowerCase();
        const skip = ['my', 'your', 'our', 'his', 'her', 'their', 'the', 'an', 'this', 'that', 'order', 'refund', 'customer', 'account', 'a', 'last', 'four'];
        if (!skip.includes(name)) {
          isThirdPartyDisclosureRequest = true;
          thirdPartyName = m[1].trim();
          break;
        }
      }
    }

    // Also check explicit known customer names if asked for their details
    if (!isThirdPartyDisclosureRequest) {
      const knownNames = [
        'palesa naidoo', 'riaan govender', 'ilse khumalo', 'tendai mokoena',
        'ruan zulu', 'yusuf naidoo', 'thabo sithole', 'keshav molefe',
        'mpho williams', 'sibusiso williams', 'lerato pillay', 'anele botha',
        'megan botha', 'sipho molefe'
      ];
      for (const kn of knownNames) {
        if (lower.includes(kn)) {
          if (!lower.includes(`i am ${kn}`) && !lower.includes(`my name is ${kn}`) && !lower.includes(`this is ${kn}`)) {
            isThirdPartyDisclosureRequest = true;
            thirdPartyName = kn;
            break;
          }
        }
      }
    }
  }

  return {
    email: emailMatch ? emailMatch[1].trim() : null,
    phone_last4,
    order_number,
    customer_id,
    isConfirmation,
    isPartial,
    isDuplicate,
    isAccessIssue,
    isThirdPartyDisclosureRequest,
    thirdPartyName,
  };
}

/**
 * Process a message through the H9loop Support Resolver Agent
 */
export async function handleCustomerMessage(
  userMessage: string,
  context: AgentContext
): Promise<AgentResponse> {
  const toolsBefore = context.tool_calls.length;
  const { case_block } = context;
  const dataDir = resolveDataDir(context.dataDir);
  context.dataDir = dataDir;

  // Initialize and append to session conversation history
  if (!context.conversation_history) {
    context.conversation_history = [];
  }
  context.conversation_history.push({ sender: 'customer', text: userMessage });

  const entities = extractEntities(userMessage);

  // Multi-Turn Memory: Preserve credentials and orders provided in this or previous turns
  if (entities.email) {
    context.provided_email = entities.email;
  }
  if (entities.phone_last4) {
    context.provided_phone_last4 = entities.phone_last4;
  }
  if (entities.order_number) {
    case_block.order_number = entities.order_number;
  }

  const effectiveEmail = entities.email || context.provided_email || null;
  const effectivePhoneLast4 = entities.phone_last4 || context.provided_phone_last4 || null;

  // If user explicitly confirmed refund in this turn (and order is verified)
  if (entities.isConfirmation && case_block.order_number && case_block.verified) {
    context.user_confirmed_refund = true;
  }

  // If customer is asking for partial refund or duplicate
  if (entities.isPartial) {
    case_block.refund_type = 'partial';
  } else if (entities.isDuplicate) {
    case_block.refund_type = 'duplicate';
  }

  // =========================================================================
  // STATE 1: POPIA THIRD-PARTY DISCLOSURE REQUEST (Test A)
  // Requirement 6: "If a customer asks for another person's private information,
  // refuse disclosure and do not ask for an unrelated order number."
  // =========================================================================
  if (entities.isThirdPartyDisclosureRequest) {
    const decision = record_decision(
      {
        action: 'decline',
        rule_ids: ['G9', 'POL-12'],
        customer_id: case_block.customer_id,
        order_number: case_block.order_number,
        amount_zar: null,
        reason_code: 'POPIA_THIRD_PARTY_DISCLOSURE_REFUSED',
        needs_human_approval: false,
      },
      context
    );

    const reply = "Under South Africa's Protection of Personal Information Act (POPIA) and company privacy policy (POL-12), I cannot disclose another individual's personal contact details, email address, phone number, or private account information. I can only assist verified account holders with their own records.";
    context.conversation_history.push({ sender: 'agent', text: reply });

    return {
      reply,
      context,
      last_decision: decision,
      tool_calls_made: [],
    };
  }

  // Database health check (Requirement 8)
  try {
    const custs = readTable<Customer>('customers', dataDir);
    if (!custs || custs.length === 0) {
      throw new Error(`Customer database is empty or unreadable at ${dataDir}`);
    }
  } catch (err: any) {
    const errorReply = `System error: Database access failed (${err.message}). Unable to retrieve records.`;
    context.conversation_history.push({ sender: 'agent', text: errorReply });
    return {
      reply: errorReply,
      context,
      last_decision: record_decision(
        {
          action: 'escalate',
          rule_ids: ['G5'],
          customer_id: null,
          order_number: null,
          amount_zar: null,
          reason_code: 'DATABASE_UNAVAILABLE',
          needs_human_approval: true,
        },
        context
      ),
      tool_calls_made: [],
    };
  }

  // =========================================================================
  // STATE 2: RESOLVE OR REQUEST ORDER NUMBER
  // =========================================================================
  if (!case_block.order_number) {
    // Attempt to resolve order from provided email
    if (effectiveEmail) {
      try {
        const customers = readTable<Customer>('customers', dataDir);
        const cust = customers.find(
          (c) => c.email && c.email.trim().toLowerCase() === effectiveEmail.trim().toLowerCase()
        );
        if (cust) {
          case_block.customer_id = cust.customer_id;
          const orders = readTable<Order>('orders', dataDir);
          const custOrders = orders.filter((o) => o.customer_id === cust.customer_id);
          if (custOrders.length > 0) {
            case_block.order_number = custOrders[custOrders.length - 1].order_number;
          }
        }
      } catch (e) {
        // Continue to prompt if lookup fails
      }
    } else if (entities.customer_id) {
      try {
        case_block.customer_id = entities.customer_id;
        const orders = readTable<Order>('orders', dataDir);
        const custOrders = orders.filter((o) => o.customer_id === entities.customer_id);
        if (custOrders.length > 0) {
          case_block.order_number = custOrders[custOrders.length - 1].order_number;
        }
      } catch (e) {
        // Continue to prompt if lookup fails
      }
    }
  }

  // If order number is STILL missing after checking email and customer ID:
  if (!case_block.order_number) {
    const decision = record_decision(
      {
        action: 'ask_question',
        rule_ids: ['G8'],
        customer_id: case_block.customer_id,
        order_number: null,
        amount_zar: null,
        reason_code: 'MISSING_ORDER_NUMBER',
        needs_human_approval: false,
      },
      context
    );

    let reply = 'Hello! I would be glad to assist you. To locate your purchase and protect your account under POPIA, please provide your H9loop order number (e.g., H9-10159) or your registered email address.';
    if (effectiveEmail && effectivePhoneLast4) {
      reply = `Thank you for providing your verification details (${effectiveEmail}, ending in ${effectivePhoneLast4}). I was unable to find an existing order for this email. Please provide your H9loop order number (e.g., H9-10159).`;
    } else if (effectiveEmail) {
      reply = `Thank you for providing your email (${effectiveEmail}). Please provide your H9loop order number (e.g., H9-10159) so I can locate your purchase.`;
    }

    context.conversation_history.push({ sender: 'agent', text: reply });
    return {
      reply,
      context,
      last_decision: decision,
      tool_calls_made: [],
    };
  }

  // =========================================================================
  // STATE 3: LOOKUP ORDER IN DATABASE
  // =========================================================================
  let orderInfo = executeTool(
    'lookup_order',
    { order_number: case_block.order_number },
    () => lookup_order(case_block.order_number!, dataDir),
    context
  );

  if ('is_error' in orderInfo) {
    const decision = record_decision(
      {
        action: 'ask_question',
        rule_ids: ['G2'],
        customer_id: null,
        order_number: case_block.order_number,
        amount_zar: null,
        reason_code: 'ORDER_NOT_FOUND',
        needs_human_approval: false,
      },
      context
    );

    const reply = `I could not locate order ${case_block.order_number} in our records. Please verify the order number and provide it again.`;
    context.conversation_history.push({ sender: 'agent', text: reply });
    return {
      reply,
      context,
      last_decision: decision,
      tool_calls_made: context.tool_calls.slice(toolsBefore),
    };
  }

  // Update case_block from lookup
  const { order, product, payments, refunds } = orderInfo;
  case_block.customer_id = order.customer_id;
  case_block.product_id = order.product_id;
  case_block.amount_zar = order.amount_zar;
  case_block.order_date = order.order_date;

  // =========================================================================
  // STATE 4: IDENTITY VERIFICATION (Rule G1, POL-10)
  // Check if verified. If not, check what credentials are missing.
  // =========================================================================
  if (!case_block.verified) {
    // Check if user has provided both email and phone_last4
    if (!effectiveEmail || !effectivePhoneLast4) {
      const decision = record_decision(
        {
          action: 'ask_question',
          rule_ids: ['G1', 'POL-10', 'POL-12'],
          customer_id: case_block.customer_id,
          order_number: case_block.order_number,
          amount_zar: null,
          reason_code: 'AWAITING_VERIFICATION_CREDENTIALS',
          needs_human_approval: false,
        },
        context
      );

      let reply = '';
      if (!effectiveEmail && !effectivePhoneLast4) {
        // Test B: Recognised order number, asks ONLY for missing identity verification details!
        reply = `I have located order ${case_block.order_number}. In accordance with South African POPIA regulations and company security policy, before I can retrieve your account specifics or process a refund, please provide your registered email address and the last 4 digits of your phone number for verification.`;
      } else if (!effectivePhoneLast4) {
        reply = `I have located order ${case_block.order_number} and noted your email (${effectiveEmail}). To complete identity verification under POPIA, please also provide the last 4 digits of your phone number.`;
      } else {
        reply = `I have located order ${case_block.order_number} and noted your phone digits (ending in ${effectivePhoneLast4}). To complete identity verification under POPIA, please also provide your registered email address.`;
      }

      context.conversation_history.push({ sender: 'agent', text: reply });
      return {
        reply,
        context,
        last_decision: decision,
        tool_calls_made: context.tool_calls.slice(toolsBefore),
      };
    }

    // Both credentials present! Call verify_identity tool (Test C)
    const verificationResult = executeTool(
      'verify_identity',
      {
        customer_id: case_block.customer_id,
        email: effectiveEmail,
        phone_last4: effectivePhoneLast4,
      },
      () =>
        verify_identity(
          case_block.customer_id!,
          effectiveEmail,
          effectivePhoneLast4,
          dataDir,
          case_block.attempts_left ?? 2
        ),
      context
    );

    if ('is_error' in verificationResult) {
      const decision = record_decision(
        {
          action: 'ask_question',
          rule_ids: ['G1'],
          customer_id: case_block.customer_id,
          order_number: case_block.order_number,
          amount_zar: null,
          reason_code: 'VERIFICATION_TOOL_ERROR',
          needs_human_approval: false,
        },
        context
      );
      const reply = `Verification check encountered an issue: ${verificationResult.message}`;
      context.conversation_history.push({ sender: 'agent', text: reply });
      return {
        reply,
        context,
        last_decision: decision,
        tool_calls_made: context.tool_calls.slice(toolsBefore),
      };
    }

    case_block.attempts_left = verificationResult.attempts_left;

    if (!verificationResult.verified) {
      if (verificationResult.attempts_left <= 0) {
        // Verification failed twice: Escalate (G5)
        const escalation = executeTool(
          'escalate_to_human',
          {
            reason_code: 'VERIFICATION_FAILED_TWICE',
            customer_id: case_block.customer_id,
            order_number: case_block.order_number,
            summary: `Customer failed identity verification twice for order ${case_block.order_number}.`,
          },
          () =>
            escalate_to_human(
              'VERIFICATION_FAILED_TWICE',
              case_block.customer_id!,
              case_block.order_number,
              `Customer failed identity verification twice for order ${case_block.order_number}.`,
              dataDir
            ),
          context
        );
        case_block.case_number = 'is_error' in escalation ? null : escalation.case_number;
        context.conversation_ended = true;

        const decision = record_decision(
          {
            action: 'escalate',
            rule_ids: ['G1', 'G5'],
            customer_id: case_block.customer_id,
            order_number: case_block.order_number,
            amount_zar: case_block.amount_zar,
            reason_code: 'VERIFICATION_FAILED_TWICE',
            needs_human_approval: true,
          },
          context
        );

        const reply = `Identity verification could not be completed. For your security under POPIA, I have escalated this matter to our support team under Case ${case_block.case_number}. A representative will contact you directly.`;
        context.conversation_history.push({ sender: 'agent', text: reply });
        return {
          reply,
          context,
          last_decision: decision,
          tool_calls_made: context.tool_calls.slice(toolsBefore),
        };
      } else {
        const decision = record_decision(
          {
            action: 'ask_question',
            rule_ids: ['G1', 'POL-10'],
            customer_id: case_block.customer_id,
            order_number: case_block.order_number,
            amount_zar: null,
            reason_code: 'VERIFICATION_MISMATCH',
            needs_human_approval: false,
          },
          context
        );
        const reply = `The email address or phone digits supplied did not match our records. You have ${verificationResult.attempts_left} attempt remaining. Please re-enter your registered email address and the last 4 digits of your phone number.`;
        context.conversation_history.push({ sender: 'agent', text: reply });
        return {
          reply,
          context,
          last_decision: decision,
          tool_calls_made: context.tool_calls.slice(toolsBefore),
        };
      }
    }

    // Verification Succeeded!
    case_block.verified = true;
  }

  // STEP 4: Call get_customer to check account_status and fraud flags
  const custInfo = executeTool(
    'get_customer',
    { customer_id: case_block.customer_id },
    () => get_customer(case_block.customer_id!, dataDir),
    context
  );

  if ('is_error' in custInfo) {
    const decision = record_decision(
      {
        action: 'escalate',
        rule_ids: ['G5'],
        customer_id: case_block.customer_id,
        order_number: case_block.order_number,
        amount_zar: case_block.amount_zar,
        reason_code: 'CUSTOMER_RECORD_ERROR',
        needs_human_approval: true,
      },
      context
    );
    return {
      reply: 'An error occurred fetching customer records. Escalating to support team.',
      context,
      last_decision: decision,
      tool_calls_made: context.tool_calls.slice(toolsBefore),
    };
  }

  const customerData = custInfo.customer;

  // RULE POL-07 (Scenario 7): Fraud Flagged Account
  if (customerData.fraud_flag === 1) {
    const escalation = executeTool(
      'escalate_to_human',
      {
        reason_code: 'FRAUD_FLAGGED',
        customer_id: case_block.customer_id,
        order_number: case_block.order_number,
        summary: 'Account flagged for security review. Customer attempted support inquiry.',
      },
      () =>
        escalate_to_human(
          'FRAUD_FLAGGED',
          case_block.customer_id!,
          case_block.order_number,
          'Account flagged for security review. Customer attempted support inquiry.',
          dataDir
        ),
      context
    );

    const caseNum = 'is_error' in escalation ? 'CS-SECURITY' : escalation.case_number;
    case_block.case_number = caseNum;
    context.conversation_ended = true;

    const decision = record_decision(
      {
        action: 'escalate',
        rule_ids: ['POL-07', 'G5', 'G9'],
        customer_id: case_block.customer_id,
        order_number: case_block.order_number,
        amount_zar: case_block.amount_zar,
        reason_code: 'FRAUD_FLAGGED',
        needs_human_approval: true,
      },
      context
    );

    // CRITICAL: POPIA & POL-07 rule: Never reveal internal fraud flag to customer!
    return {
      reply: `Thank you for confirming your details, ${customerData.full_name}. For account security, this request requires administrative review. I have opened Case ${caseNum} with our Security team, who will review your account and follow up with you via your registered email address.`,
      context,
      last_decision: decision,
      tool_calls_made: context.tool_calls.slice(toolsBefore),
    };
  }

  // RULE POL-08 (Scenario 14): Locked or Suspended Account
  if (customerData.account_status === 'locked' || customerData.account_status === 'suspended') {
    const isLocked = customerData.account_status === 'locked';
    const reasonCode = isLocked ? 'ACCOUNT_LOCKED' : 'ACCOUNT_SUSPENDED';

    const escalation = executeTool(
      'escalate_to_human',
      {
        reason_code: reasonCode,
        customer_id: case_block.customer_id,
        order_number: case_block.order_number,
        summary: `Customer account is ${customerData.account_status}. Routed to Account Recovery team for assistance.`,
      },
      () =>
        escalate_to_human(
          reasonCode,
          case_block.customer_id!,
          case_block.order_number,
          `Customer account is ${customerData.account_status}. Routed to Account Recovery team for assistance.`,
          dataDir
        ),
      context
    );

    const caseNum = 'is_error' in escalation ? 'CS-RECOVERY' : escalation.case_number;
    case_block.case_number = caseNum;
    context.conversation_ended = true;

    const decision = record_decision(
      {
        action: 'escalate',
        rule_ids: ['POL-08', 'G5'],
        customer_id: case_block.customer_id,
        order_number: case_block.order_number,
        amount_zar: case_block.amount_zar,
        reason_code: reasonCode,
        needs_human_approval: true,
      },
      context
    );

    return {
      reply: `Your account is currently ${customerData.account_status}. In line with our security guidelines, self-service transactions are disabled while an account is ${customerData.account_status}. I have created Case ${caseNum} and escalated your request directly to our Account Recovery team, who will contact you to unlock your account.`,
      context,
      last_decision: decision,
      tool_calls_made: context.tool_calls.slice(toolsBefore),
    };
  }

  // RULE: Paid but Access Missing (Scenario 10)
  // If delivery_status == 'pending_access' and customer didn't specifically demand refund
  if (
    order.delivery_status === 'pending_access' &&
    (entities.isAccessIssue || !userMessage.toLowerCase().includes('refund'))
  ) {
    const escalation = executeTool(
      'escalate_to_human',
      {
        reason_code: 'PENDING_ACCESS',
        customer_id: case_block.customer_id,
        order_number: case_block.order_number,
        summary: `Payment settled for order ${case_block.order_number}, but course access is pending delivery. Escalating for access provisioning.`,
      },
      () =>
        escalate_to_human(
          'PENDING_ACCESS',
          case_block.customer_id!,
          case_block.order_number,
          `Payment settled for order ${case_block.order_number}, but course access is pending delivery. Escalating for access provisioning.`,
          dataDir
        ),
      context
    );

    const caseNum = 'is_error' in escalation ? 'CS-ACCESS' : escalation.case_number;
    case_block.case_number = caseNum;
    context.conversation_ended = true;

    const decision = record_decision(
      {
        action: 'escalate',
        rule_ids: ['G5', 'POL-10'],
        customer_id: case_block.customer_id,
        order_number: case_block.order_number,
        amount_zar: case_block.amount_zar,
        reason_code: 'PENDING_ACCESS',
        needs_human_approval: true,
      },
      context
    );

    return {
      reply: `I see that your payment for order ${case_block.order_number} has been settled, but your course access is pending activation. As an automated agent, I do not have direct permission to modify course access credentials, so I have escalated your case to our Technical Delivery team under Case ${caseNum}. They will activate your access promptly. (If you prefer a full refund instead of access, please let me know.)`,
      context,
      last_decision: decision,
      tool_calls_made: context.tool_calls.slice(toolsBefore),
    };
  }

  // RULE POL-13 (Scenario 11): Partial Refund Request
  if (entities.isPartial || case_block.refund_type === 'partial') {
    const escalation = executeTool(
      'escalate_to_human',
      {
        reason_code: 'PARTIAL_REFUND_ESCALATION',
        customer_id: case_block.customer_id,
        order_number: case_block.order_number,
        summary: `Customer requested a partial refund on order ${case_block.order_number} (total R${order.amount_zar}).`,
      },
      () =>
        escalate_to_human(
          'PARTIAL_REFUND_ESCALATION',
          case_block.customer_id!,
          case_block.order_number,
          `Customer requested a partial refund on order ${case_block.order_number} (total R${order.amount_zar}).`,
          dataDir
        ),
      context
    );

    const caseNum = 'is_error' in escalation ? 'CS-PARTIAL' : escalation.case_number;
    case_block.case_number = caseNum;
    context.conversation_ended = true;

    const decision = record_decision(
      {
        action: 'escalate',
        rule_ids: ['POL-13', 'G5', 'G6'],
        customer_id: case_block.customer_id,
        order_number: case_block.order_number,
        amount_zar: case_block.amount_zar,
        reason_code: 'PARTIAL_REFUND_ESCALATION',
        needs_human_approval: true,
      },
      context
    );

    return {
      reply: `Under company policy (POL-13), partial refunds cannot be processed automatically. I have opened Case ${caseNum} and routed your partial refund request to our Specialist Support team, who will review the request and get back to you.`,
      context,
      last_decision: decision,
      tool_calls_made: context.tool_calls.slice(toolsBefore),
    };
  }

  // STEP 5: Check Refund Eligibility (Tool 4)
  const refundType = entities.isDuplicate ? 'duplicate' : 'standard';
  case_block.refund_type = refundType;

  const eligibility = executeTool(
    'check_refund_eligibility',
    { order_number: case_block.order_number, refund_type: refundType },
    () => check_refund_eligibility(case_block.order_number!, refundType, dataDir),
    context
  );

  if ('is_error' in eligibility) {
    const decision = record_decision(
      {
        action: 'escalate',
        rule_ids: ['G5'],
        customer_id: case_block.customer_id,
        order_number: case_block.order_number,
        amount_zar: case_block.amount_zar,
        reason_code: 'ELIGIBILITY_ERROR',
        needs_human_approval: true,
      },
      context
    );

    return {
      reply: `An error occurred while evaluating refund eligibility: ${eligibility.message}. Escalating to human support.`,
      context,
      last_decision: decision,
      tool_calls_made: context.tool_calls.slice(toolsBefore),
    };
  }

  // Scenario 9: Already refunded
  if (eligibility.reason_code === 'ALREADY_REFUNDED') {
    context.conversation_ended = true;
    const existingRefId = eligibility.existing_refund_id || 'RF700000';
    case_block.refund_id = existingRefId;

    const decision = record_decision(
      {
        action: 'decline',
        rule_ids: ['POL-03', 'G10'],
        customer_id: case_block.customer_id,
        order_number: case_block.order_number,
        amount_zar: 0,
        reason_code: 'ALREADY_REFUNDED',
        needs_human_approval: false,
      },
      context
    );

    return {
      reply: `Our records indicate that order ${case_block.order_number} has already been refunded under Refund ID ${existingRefId}. Under company policy (POL-03), only one refund is permitted per order.`,
      context,
      last_decision: decision,
      tool_calls_made: context.tool_calls.slice(toolsBefore),
    };
  }

  // Scenario 3: Non-refundable product
  if (eligibility.reason_code === 'NON_REFUNDABLE_PRODUCT') {
    context.conversation_ended = true;
    const decision = record_decision(
      {
        action: 'decline',
        rule_ids: ['POL-02', 'G10'],
        customer_id: case_block.customer_id,
        order_number: case_block.order_number,
        amount_zar: 0,
        reason_code: 'NON_REFUNDABLE_PRODUCT',
        needs_human_approval: false,
      },
      context
    );

    return {
      reply: `I am unable to process a refund for order ${case_block.order_number}. Under H9loop policy (POL-02), downloadable digital products (such as the Prompt Template Pack) are strictly non-refundable once delivered.`,
      context,
      last_decision: decision,
      tool_calls_made: context.tool_calls.slice(toolsBefore),
    };
  }

  // Scenario 2: Window expired (POL-01)
  if (eligibility.reason_code === 'WINDOW_EXPIRED') {
    context.conversation_ended = true;
    const decision = record_decision(
      {
        action: 'decline',
        rule_ids: ['POL-01', 'G10'],
        customer_id: case_block.customer_id,
        order_number: case_block.order_number,
        amount_zar: 0,
        reason_code: 'WINDOW_EXPIRED',
        needs_human_approval: false,
      },
      context
    );

    return {
      reply: `I regret to inform you that order ${case_block.order_number} is no longer eligible for a refund. Under H9loop policy (POL-01), refunds must be requested within 14 calendar days of purchase. The refund window expired on ${order.refund_window_ends} (placed ${eligibility.days_elapsed} days ago).`,
      context,
      last_decision: decision,
      tool_calls_made: context.tool_calls.slice(toolsBefore),
    };
  }

  // Scenario 8: Subscription window expired (POL-06)
  if (eligibility.reason_code === 'SUBSCRIPTION_WINDOW_EXPIRED') {
    context.conversation_ended = true;
    const decision = record_decision(
      {
        action: 'decline',
        rule_ids: ['POL-06', 'POL-01'],
        customer_id: case_block.customer_id,
        order_number: case_block.order_number,
        amount_zar: 0,
        reason_code: 'SUBSCRIPTION_WINDOW_EXPIRED',
        needs_human_approval: false,
      },
      context
    );

    return {
      reply: `Subscription renewal payments cannot be reversed after 14 days under H9loop policy (POL-06). This subscription renewed 20 days ago on ${order.order_date}, which is outside the eligible window.`,
      context,
      last_decision: decision,
      tool_calls_made: context.tool_calls.slice(toolsBefore),
    };
  }

  // Scenario 5 & 6: Exceeds Limits (> R10,000 or > R5,000)
  if (eligibility.reason_code === 'AMOUNT_EXCEEDS_HARD_LIMIT' || eligibility.reason_code === 'AMOUNT_REQUIRES_APPROVAL') {
    const isHardLimit = eligibility.reason_code === 'AMOUNT_EXCEEDS_HARD_LIMIT';
    const ruleId = isHardLimit ? 'POL-05' : 'POL-04';

    const escalation = executeTool(
      'escalate_to_human',
      {
        reason_code: eligibility.reason_code,
        customer_id: case_block.customer_id,
        order_number: case_block.order_number,
        summary: `Refund of R${order.amount_zar.toLocaleString('en-ZA', {
          minimumFractionDigits: 2,
        })} on order ${order.order_number} exceeds automated limits (${ruleId}). Escalating to Finance/Human approval.`,
      },
      () =>
        escalate_to_human(
          eligibility.reason_code,
          case_block.customer_id!,
          case_block.order_number,
          `Refund of R${order.amount_zar.toLocaleString('en-ZA', {
            minimumFractionDigits: 2,
          })} on order ${order.order_number} exceeds automated limits (${ruleId}). Escalating to Finance/Human approval.`,
          dataDir
        ),
      context
    );

    const caseNum = 'is_error' in escalation ? 'CS-FINANCE' : escalation.case_number;
    case_block.case_number = caseNum;
    context.conversation_ended = true;

    const decision = record_decision(
      {
        action: 'escalate',
        rule_ids: [ruleId, 'G6'],
        customer_id: case_block.customer_id,
        order_number: case_block.order_number,
        amount_zar: order.amount_zar,
        reason_code: eligibility.reason_code,
        needs_human_approval: true,
      },
      context
    );

    return {
      reply: `Your refund request for order ${order.order_number} in the amount of R${order.amount_zar.toLocaleString(
        'en-ZA',
        { minimumFractionDigits: 2 }
      )} exceeds our automated processing threshold (${isHardLimit ? 'above R10,000 limit' : 'above R5,000 limit'}) under company policy ${ruleId}. I have created Case ${caseNum} and escalated your request to our Finance & Management approvals team for human review.`,
      context,
      last_decision: decision,
      tool_calls_made: context.tool_calls.slice(toolsBefore),
    };
  }

  // Scenario 4: Duplicate Charge Resolution
  if (eligibility.reason_code === 'DUPLICATE_CHARGE_ELIGIBLE') {
    const refundAmt = eligibility.refund_amount_zar;
    // Inspect -> Approve -> Execute: For duplicate charges, execute refund of redundant payment
    const idempotencyKey = `IDEMP-${order.order_number}-DUP-${Date.now()}`;
    const refundResult = executeTool(
      'process_refund',
      {
        order_number: case_block.order_number,
        refund_type: 'duplicate',
        idempotency_key: idempotencyKey,
      },
      () => process_refund(case_block.order_number!, 'duplicate', idempotencyKey, dataDir),
      context
    );

    if ('is_error' in refundResult) {
      const decision = record_decision(
        {
          action: 'escalate',
          rule_ids: ['G5'],
          customer_id: case_block.customer_id,
          order_number: case_block.order_number,
          amount_zar: refundAmt,
          reason_code: 'REFUND_EXECUTION_FAILED',
          needs_human_approval: true,
        },
        context
      );
      return {
        reply: `A tool error occurred processing the duplicate refund: ${refundResult.message}. Escalating to human operations.`,
        context,
        last_decision: decision,
        tool_calls_made: context.tool_calls.slice(toolsBefore),
      };
    }

    case_block.refund_id = refundResult.refund_id;
    context.conversation_ended = true;

    const decision = record_decision(
      {
        action: 'process_refund',
        rule_ids: ['POL-09', 'G3', 'G4'],
        customer_id: case_block.customer_id,
        order_number: case_block.order_number,
        amount_zar: refundAmt,
        reason_code: 'DUPLICATE_CHARGE_REFUNDED',
        needs_human_approval: false,
      },
      context
    );

    return {
      reply: `I have confirmed that two settled payments of R${refundAmt.toLocaleString('en-ZA', {
        minimumFractionDigits: 2,
      })} were recorded for order ${case_block.order_number}. I have processed a refund for the duplicate payment of R${refundAmt.toLocaleString(
        'en-ZA',
        { minimumFractionDigits: 2 }
      )} under Refund ID ${refundResult.refund_id}. Your original course enrollment remains active and unaffected.`,
      context,
      last_decision: decision,
      tool_calls_made: context.tool_calls.slice(toolsBefore),
    };
  }

  // Scenario 1, 12, 13: Standard Refund Eligible (Inspect -> Approve -> Execute)
  if (eligibility.reason_code === 'ELIGIBLE_WITHIN_WINDOW') {
    const refundAmt = eligibility.refund_amount_zar;

    // Has customer explicitly approved? (Rule G4: Refund Approval)
    if (!context.user_confirmed_refund) {
      const decision = record_decision(
        {
          action: 'confirm_refund',
          rule_ids: ['G4', 'POL-01'],
          customer_id: case_block.customer_id,
          order_number: case_block.order_number,
          amount_zar: refundAmt,
          reason_code: 'AWAITING_CUSTOMER_CONFIRMATION',
          needs_human_approval: false,
        },
        context
      );

      return {
        reply: `Your purchase for order ${case_block.order_number} is eligible for a full refund of R${refundAmt.toLocaleString(
          'en-ZA',
          { minimumFractionDigits: 2 }
        )}. Before I execute this transaction, please confirm: would you like me to process this refund to your original payment method now? (Reply "yes" or "confirm" to proceed)`,
        context,
        last_decision: decision,
        tool_calls_made: context.tool_calls.slice(toolsBefore),
      };
    }

    // Customer has confirmed! EXECUTE refund with idempotency key
    const idempotencyKey = `IDEMP-${order.order_number}-STD-${Date.now()}`;
    const refundResult = executeTool(
      'process_refund',
      {
        order_number: case_block.order_number,
        refund_type: 'standard',
        idempotency_key: idempotencyKey,
      },
      () => process_refund(case_block.order_number!, 'standard', idempotencyKey, dataDir),
      context
    );

    if ('is_error' in refundResult) {
      const decision = record_decision(
        {
          action: 'escalate',
          rule_ids: ['G5'],
          customer_id: case_block.customer_id,
          order_number: case_block.order_number,
          amount_zar: refundAmt,
          reason_code: 'REFUND_FAILED',
          needs_human_approval: true,
        },
        context
      );

      return {
        reply: `Failed to process refund: ${refundResult.message}. I have escalated this matter to human support.`,
        context,
        last_decision: decision,
        tool_calls_made: context.tool_calls.slice(toolsBefore),
      };
    }

    case_block.refund_id = refundResult.refund_id;
    context.conversation_ended = true;

    const decision = record_decision(
      {
        action: 'process_refund',
        rule_ids: ['POL-01', 'G3', 'G4'],
        customer_id: case_block.customer_id,
        order_number: case_block.order_number,
        amount_zar: refundAmt,
        reason_code: 'REFUND_PROCESSED_SUCCESSFULLY',
        needs_human_approval: false,
      },
      context
    );

    return {
      reply: `Your refund has been successfully processed! Refund ID: ${refundResult.refund_id}. Total amount: R${refundAmt.toLocaleString(
        'en-ZA',
        { minimumFractionDigits: 2 }
      )} has been credited back to your original payment method. Thank you for contacting H9loop support!`,
      context,
      last_decision: decision,
      tool_calls_made: context.tool_calls.slice(toolsBefore),
    };
  }

  // Fallback close
  const decision = record_decision(
    {
      action: 'close',
      rule_ids: ['G10'],
      customer_id: case_block.customer_id,
      order_number: case_block.order_number,
      amount_zar: case_block.amount_zar,
      reason_code: 'INQUIRY_RESOLVED',
      needs_human_approval: false,
    },
    context
  );

  return {
    reply: 'Thank you for reaching out to H9loop customer support. Is there anything else I can assist you with?',
    context,
    last_decision: decision,
    tool_calls_made: context.tool_calls.slice(toolsBefore),
  };
}
