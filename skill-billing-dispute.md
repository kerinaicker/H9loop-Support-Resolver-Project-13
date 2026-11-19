# Skill: Billing Dispute Resolution (`skill-billing-dispute.md`)

## Objective
Handle duplicate charges, unexpected transaction amounts, and delivery access issues cleanly while preserving financial audit integrity.

## Procedures

### 1. Duplicate Charges
- **Criteria**: Customer reports being billed twice for a single order.
- **Lookup**: Inspect `payments` table for matching `order_number`.
- **Validation**: Check for two settled payments of the identical amount.
- **Action**:
  - If verified, initiate duplicate charge refund for the redundant payment amount.
  - The customer's primary order remains active and enrolled.
  - If payment data does not show duplicate settled charges or shows conflicting data, escalate to Senior Operations.

### 2. Paid but Access Missing (`pending_access`)
- **Criteria**: Order is paid and settled, but `delivery_status` is `"pending_access"`.
- **Constraint**: The support agent possesses NO tool that can directly grant access credentials.
- **Resolution Flow**:
  - Inform customer that the case is being escalated to the Technical Delivery team to activate immediate course access.
  - Create support case via `escalate_to_human`.
  - Only process a refund if the customer explicitly requests a refund instead of access.
