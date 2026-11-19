# Skill: Account Recovery & Security Escalation (`skill-account-recovery.md`)

## Objective
Detect accounts with restricted statuses (locked, suspended, fraud-flagged) and route them to designated human specialists safely and compliantly.

## Protocol

### 1. Locked Accounts (`account_status == "locked"`)
- The customer cannot perform self-service actions, modifications, or refunds.
- Trigger `escalate_to_human(reason_code="LOCKED_ACCOUNT", customer_id, order_number, summary="Account locked. Routed to Account Recovery for identity re-verification and unlock.")`.
- Advise the customer: "Your account is temporarily locked for security. A support case has been opened with our Account Recovery team who will assist you shortly."

### 2. Suspended Accounts (`account_status == "suspended"`)
- Stop automated processing.
- Escalate to Account Recovery.

### 3. Fraud Flagged Accounts (`fraud_flag == 1`)
- **CRITICAL**: Do NOT reveal the fraud flag or suspicion to the customer.
- Route quietly to `Security` queue using `escalate_to_human(reason_code="SECURITY_REVIEW", ...)`.
- Neutral messaging to customer: "Your request requires specialized assistance from our operations team. I have opened case [case_number] and a representative will follow up with you via your registered email."
