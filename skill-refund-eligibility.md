# Skill: Refund Eligibility Evaluation (`skill-refund-eligibility.md`)

## Objective
Evaluate whether a purchase made on H9loop is eligible for full or duplicate refund, enforcing all policies deterministically in backend code.

## Evaluation Checklist
1. **Account Status Check**:
   - If customer `fraud_flag == 1` -> Return `eligible: false`, `reason_code: "FRAUD_FLAGGED"`. Escalate to Security. Do NOT disclose fraud to customer.
   - If customer `account_status` in (`locked`, `suspended`) -> Return `eligible: false`, `reason_code: "ACCOUNT_LOCKED"`. Escalate to Account Recovery.
2. **Prior Refund Status**:
   - If order `refund_status == 'refunded'` -> Return `eligible: false`, `reason_code: "ALREADY_REFUNDED"`. Retrieve and quote existing `refund_id`.
3. **Product Refundability**:
   - If product `refundable == 0` (e.g. P009 Downloadable Prompt Template Pack) -> Return `eligible: false`, `reason_code: "NON_REFUNDABLE_PRODUCT"`. Politely decline.
4. **Time Window**:
   - Reference date: `2026-10-05`.
   - Days elapsed = `date_diff_days(2026-10-05, order_date)`.
   - If `days_elapsed > 14`:
     - If subscription renewal (`is_subscription == 1`) -> Return `eligible: false`, `reason_code: "SUBSCRIPTION_WINDOW_EXPIRED"`.
     - Otherwise -> Return `eligible: false`, `reason_code: "WINDOW_EXPIRED"`. Decline politely and explain 14-day policy.
5. **Partial Refund Request**:
   - Agent does not process partial refunds. Return `eligible: false`, `reason_code: "PARTIAL_REFUND_ESCALATION"`. Escalate to Human.
6. **Monetary Thresholds**:
   - If amount > R10,000 -> Return `eligible: false`, `requires_human: true`, `reason_code: "AMOUNT_EXCEEDS_HARD_LIMIT"`. Escalate.
   - If amount > R5,000 -> Return `eligible: true`, `requires_human: true`, `reason_code: "AMOUNT_REQUIRES_APPROVAL"`. Escalate to Human Approvals.
   - If amount <= R5,000 -> Return `eligible: true`, `requires_human: false`. Can proceed after customer explicit agreement.
7. **Duplicate Charge Evaluation**:
   - If `refund_type == 'duplicate_charge'`, check `payments` table for that `order_number`.
   - Must have exactly >= 2 `settled` payments with identical amount.
   - If found, refund 1 duplicate payment; keep original order enrolled.
