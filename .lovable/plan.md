# Welfare Case Platform Refactor

Good news: the existing DB is already event-based (`welfare_events` + `contributions` with `status`, `mpesa_code`, `event_type`, `target_amount`). We extend rather than rebuild — no data loss, all existing sign-ins keep working.

## 1. Database changes (one migration)

Extend existing tables + add new ones. Keep table names to avoid breaking imports; alias in UI as "Welfare Case".

**Extend `welfare_events`** (Welfare Cases):
- `contribution_per_member numeric` — expected amount each member pays
- `deadline date`
- `beneficiary_name text` (fallback when no linked member)
- Status enum values already: `draft`, `active`, `closed`, `completed`

**Extend `contributions`**:
- `payment_date date` (Mpesa payment date, distinct from `paid_at`/created)
- `member_comment text`
- `reviewed_by uuid references auth.users`
- `reviewed_at timestamptz`
- `review_notes text`
- `rejection_reason text`
- Status enum extended to: `pending`, `approved`, `rejected`, `verification_requested` (rename `confirmed` → `approved` via enum alter + data update). Update `event_totals()` RPC accordingly.
- Unique partial index `(event_id, contributor_id) WHERE status IN ('pending','approved','verification_requested')` — prevents duplicate active submissions.

**New tables**:
- `welfare_payouts` — `case_id`, `amount`, `paid_to`, `paid_at`, `method`, `reference`, `notes`, `recorded_by`
- `notifications` — `user_id`, `type`, `title`, `body`, `case_id?`, `contribution_id?`, `read_at`
- `audit_logs` — `actor_id`, `action`, `entity_type`, `entity_id`, `metadata jsonb`

**Roles**: extend `app_role` enum with `treasurer`. Update `has_role` unchanged (already generic).

**RLS**:
- Cases: all authenticated read active/closed/completed; admins full CRUD.
- Contributions: member sees own; treasurer + admin see all; only treasurer/admin can approve/reject (WITH CHECK on status transitions).
- Payouts: admin write; all read.
- Notifications: user reads/updates own.
- Audit logs: admin read only; writes via SECURITY DEFINER triggers.

**Public visibility RPCs** (SECURITY DEFINER, no PII leak):
- `case_contributor_status(case_id)` — returns `(user_id, full_name, status, payment_date)` for every member, joining `profiles` × `contributions`. No amounts, no mpesa codes.
- Extend `event_totals` to only sum `approved` contributions.

## 2. Backend (server functions)

New `src/lib/cases.functions.ts`:
- `submitContribution({ caseId, amount, mpesaCode, paymentDate, comment })` — auth required, blocks duplicates via unique index.
- `reviewContribution({ id, action: 'approve'|'reject'|'request_verification', notes })` — requires treasurer/admin role, transactional, writes audit_log + notification to member.
- `createCase`, `updateCase`, `closeCase`, `recordPayout` — admin only.
- `caseRoster(caseId)` — calls `case_contributor_status` RPC.
- `dashboardStats()` — replaces old stats: active/open/closed cases, pending approvals, approved total, payouts total, available balance.

Guards: admin cannot approve own contribution (checked in `reviewContribution`).

## 3. Frontend

Preserve auth, phone login, `_authenticated` layout, admin recovery.

Rename routes / rework pages:
- `dashboard.tsx` — new stat cards, recent contributions feed, upcoming deadlines, pending approvals count.
- `events/` → keep folder (route id) but relabel UI as **Welfare Cases**; `events/index.tsx` becomes case list with filters (status, search) and progress bars; `events/$id.tsx` becomes the Case Detail with summary cards, progress, tabbed member table (Paid / Pending / Not Paid / Rejected), activity timeline, admin actions (close, payout, reminder).
- New `contributions.tsx` — member's own contribution history + "Submit Contribution" flow.
- New `approvals.tsx` — treasurer queue: list of pending contributions with Approve / Reject / Request Verification actions.
- New `payouts.tsx` — admin payout ledger.
- New `reports.tsx` — per-case report with export (CSV first; PDF via print stylesheet).
- New `notifications.tsx` + bell in header.
- Update sidebar nav: Dashboard, Members, Welfare Cases, Contributions, Approvals, Payouts, Reports, Settings.
- Delete/repurpose obsolete monthly-collection UI (`roster.tsx` becomes Members roster; no monthly logic exists in it beyond current).

Design:
- Semantic status badges (green/yellow/red/gray) via CSS tokens in `styles.css`.
- Reusable `<CaseProgress>`, `<StatusBadge>`, `<StatCard>`, `<EmptyState>` components.
- Responsive tables with search/filter/pagination via existing shadcn primitives + tanstack-query.

## 4. Notifications (in-app first)

Row inserts into `notifications` triggered from server functions on: case created (fan-out to all members), contribution approved/rejected, deadline near (cron via `/api/public/deadline-reminders` — optional, wire secret). Bell shows unread count; page lists all. SMS/email deferred.

## 5. Reports & exports

CSV export via client-side generation (papaparse or hand-rolled). PDF via `window.print()` on a print-styled report page — no Node-only deps in Worker runtime.

## 6. Out of scope for this pass

- SMS gateway integration (needs provider secret from you).
- Automated deadline cron (can enable after by scheduling `/api/public/deadline-reminders`).
- Full audit UI (data captured; viewer is admin-only stub).

## Execution order

1. Migration (schema + RLS + RPCs + role enum).
2. Regenerate types, write server functions.
3. Build new/updated route pages + shared components.
4. Nav + dashboard swap.
5. Smoke-test flows: create case → member submits → treasurer approves → totals + notification update.

## Confirmation needed

- OK to **rename enum value `confirmed` → `approved`** in `contribution_status` (safe, in-place). If you prefer to keep `confirmed`, I'll alias in UI instead.
- OK to introduce a **`treasurer` role** (separate from admin). If not, admin covers both.
- CSV + print-to-PDF acceptable for exports, or do you require true server-generated PDFs?

Reply "go" (with any tweaks) and I'll execute in order.
