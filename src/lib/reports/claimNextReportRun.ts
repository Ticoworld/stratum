import { randomUUID } from "crypto";
import { sql } from "@/db/client";

export interface ClaimedReportRun {
  id: string;
  tenantId: string;
  companyId: string;
  requestedByUserId: string | null;
  triggerType: string;
  requestedCompanyName: string;
  asOfTime: Date;
  status: string;
  attemptCount: number;
  lockToken: string | null;
  lockedAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  failureCode: string | null;
  failureMessage: string | null;
  createdAt: Date;
}

function mapClaimedRun(row: Record<string, unknown>): ClaimedReportRun {
  return {
    id: String(row.id),
    tenantId: String(row.tenantId),
    companyId: String(row.companyId),
    requestedByUserId: row.requestedByUserId ? String(row.requestedByUserId) : null,
    triggerType: String(row.triggerType),
    requestedCompanyName: String(row.requestedCompanyName),
    asOfTime: new Date(String(row.asOfTime)),
    status: String(row.status),
    attemptCount: Number(row.attemptCount),
    lockToken: row.lockToken ? String(row.lockToken) : null,
    lockedAt: row.lockedAt ? new Date(String(row.lockedAt)) : null,
    startedAt: row.startedAt ? new Date(String(row.startedAt)) : null,
    completedAt: row.completedAt ? new Date(String(row.completedAt)) : null,
    failureCode: row.failureCode ? String(row.failureCode) : null,
    failureMessage: row.failureMessage ? String(row.failureMessage) : null,
    createdAt: new Date(String(row.createdAt)),
  };
}

export async function claimNextReportRun(): Promise<ClaimedReportRun | null> {
  const now = new Date();
  const lockToken = randomUUID();

  const claimed = await sql.begin(async (tx) => {
    const queued = await tx.unsafe<Record<string, unknown>[]>(`
      select
        id,
        tenant_id as "tenantId",
        company_id as "companyId",
        requested_by_user_id as "requestedByUserId",
        trigger_type as "triggerType",
        requested_company_name as "requestedCompanyName",
        as_of_time as "asOfTime",
        status,
        attempt_count as "attemptCount",
        lock_token as "lockToken",
        locked_at as "lockedAt",
        started_at as "startedAt",
        completed_at as "completedAt",
        failure_code as "failureCode",
        failure_message as "failureMessage",
        created_at as "createdAt"
      from report_runs
      where status = 'queued'
      order by created_at asc
      limit 1
      for update skip locked
    `);

    if (queued.length === 0) {
      return null;
    }

    const updated = await tx.unsafe<Record<string, unknown>[]>(
      `
      update report_runs
      set
        status = 'claimed',
        lock_token = $1::uuid,
        locked_at = $2::timestamptz,
        started_at = coalesce(started_at, $2::timestamptz),
        failure_code = null,
        failure_message = null
      where id = $3::uuid
      returning
        id,
        tenant_id as "tenantId",
        company_id as "companyId",
        requested_by_user_id as "requestedByUserId",
        trigger_type as "triggerType",
        requested_company_name as "requestedCompanyName",
        as_of_time as "asOfTime",
        status,
        attempt_count as "attemptCount",
        lock_token as "lockToken",
        locked_at as "lockedAt",
        started_at as "startedAt",
        completed_at as "completedAt",
        failure_code as "failureCode",
        failure_message as "failureMessage",
        created_at as "createdAt"
    `,
      [lockToken, now.toISOString(), String(queued[0].id)]
    );

    return updated[0] ?? null;
  });

  return claimed ? mapClaimedRun(claimed) : null;
}

export async function claimReportRunById(reportRunId: string): Promise<ClaimedReportRun | null> {
  const now = new Date();
  const lockToken = randomUUID();

  const claimed = await sql.begin(async (tx) => {
    const queued = await tx.unsafe<Record<string, unknown>[]>(
      `
      select
        id,
        tenant_id as "tenantId",
        company_id as "companyId",
        requested_by_user_id as "requestedByUserId",
        trigger_type as "triggerType",
        requested_company_name as "requestedCompanyName",
        as_of_time as "asOfTime",
        status,
        attempt_count as "attemptCount",
        lock_token as "lockToken",
        locked_at as "lockedAt",
        started_at as "startedAt",
        completed_at as "completedAt",
        failure_code as "failureCode",
        failure_message as "failureMessage",
        created_at as "createdAt"
      from report_runs
      where id = $1::uuid and status = 'queued'
      limit 1
      for update skip locked
    `,
      [reportRunId]
    );

    if (queued.length === 0) {
      return null;
    }

    const updated = await tx.unsafe<Record<string, unknown>[]>(
      `
      update report_runs
      set
        status = 'claimed',
        lock_token = $1::uuid,
        locked_at = $2::timestamptz,
        started_at = coalesce(started_at, $2::timestamptz),
        failure_code = null,
        failure_message = null
      where id = $3::uuid
      returning
        id,
        tenant_id as "tenantId",
        company_id as "companyId",
        requested_by_user_id as "requestedByUserId",
        trigger_type as "triggerType",
        requested_company_name as "requestedCompanyName",
        as_of_time as "asOfTime",
        status,
        attempt_count as "attemptCount",
        lock_token as "lockToken",
        locked_at as "lockedAt",
        started_at as "startedAt",
        completed_at as "completedAt",
        failure_code as "failureCode",
        failure_message as "failureMessage",
        created_at as "createdAt"
    `,
      [lockToken, now.toISOString(), reportRunId]
    );

    return updated[0] ?? null;
  });

  return claimed ? mapClaimedRun(claimed) : null;
}
