# Skill: Protection of Personal Information Act Compliance (`skill-popia-handling.md`)

## Objective
Enforce South Africa's POPIA (Act 4 of 2013) principles across customer communications, tool calls, and audit trail records.

## Rules
1. **Verification Before Disclosure**:
   - Customer identity must be confirmed using `email` and `verification_phone_last4` before any confidential account information, payment method, or order balance is disclosed.
   - Limit verification attempts to 2 per session.
2. **Data Minimization in Displays**:
   - Never display full phone numbers (always format as `***-***-XXXX`).
   - Never reveal bank account numbers or credit card numbers.
   - Never reveal internal notes or fraud flags.
3. **Audit Trail Masking**:
   - In `/h9loop_support/audit_trail/`, mask emails (e.g., `p***1@example.com`).
   - Store only the last 4 digits of phone numbers.
   - Do not log sensitive credentials.
4. **Cross-Tenant Isolation**:
   - Never query or disclose records belonging to any other `customer_id`.
   - Each customer conversation maintains its own isolated `case_block` and memory.
