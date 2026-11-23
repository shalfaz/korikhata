import { Types } from "mongoose";
import { AuditAction, AuditEntityType, AuditLog } from "@/models";

interface RecordAuditInput {
  companyId: string | Types.ObjectId;
  actorId: string | Types.ObjectId;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId?: string | Types.ObjectId;
  summary: string;
  metadata?: Record<string, unknown>;
}

/**
 * Persists an immutable audit trail entry scoped to the company.
 * Never throws to avoid rolling back primary user actions if logging fails.
 */
export async function recordAuditLog(input: RecordAuditInput): Promise<void> {
  try {
    await AuditLog.create({
      companyId: input.companyId,
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      summary: input.summary,
      metadata: input.metadata,
    });
  } catch (error) {
    console.error("[AuditLog] Failed to write audit entry:", error);
  }
}
