import * as Sentry from '@sentry/astro';

export type AuditAction = 'create' | 'update' | 'delete' | 'read';

export interface AuditLogEntry {
  action: AuditAction;
  entity: string;
  entityId?: string | number;
  actorEmail?: string;
  detail?: string;
}

// Persistentes Audit-Log: Jede Create-/Update-/Delete-Aktion in der Redaktion
// wird als Sentry-Event (Level info) an GlitchTip gesendet und dort
// dauerhaft gespeichert. captureEvent wird verwendet, um sicherzustellen, dass
// diese Logs nicht als Exceptions/Errors in der Fehlerueberwachung erscheinen.
export function logAdminAction(entry: AuditLogEntry): void {
  const { action, entity, entityId, actorEmail, detail } = entry;
  Sentry.captureEvent({
    level: 'info',
    message: `admin.${action}.${entity}`,
    tags: {
      audit: 'true',
      'admin.action': action,
      'admin.entity': entity,
      ...(entityId !== undefined
        ? { 'admin.entity_id': String(entityId) }
        : {}),
      ...(actorEmail ? { 'admin.actor': actorEmail } : {}),
    },
    extra: {
      action,
      entity,
      entityId,
      actorEmail,
      detail,
      timestamp: new Date().toISOString(),
    },
  });
}

export type ReaderAuditAction = 'delete' | 'request' | 'confirm';

export interface ReaderAuditEntry {
  action: ReaderAuditAction;
  entity: string;
  userId?: string;
  actorEmail?: string;
  detail?: string;
  ipAddress?: string;
}

// Sicherheitsrelevante Aktionen von Leserkonten (z. B. Kontolöschung) werden
// ebenfalls als Sentry-Event protokolliert, damit ungewöhnliche Muster
// (mehrfache Löschanträge, fehlgeschlagene Bestätigungen) auffallen.
// Die IP-Adresse wird nur bei Löschanträgen und Bestätigungen erfasst.
export function logReaderAction(entry: ReaderAuditEntry): void {
  const { action, entity, userId, actorEmail, detail, ipAddress } = entry;
  Sentry.captureEvent({
    level: 'info',
    message: `reader.${action}.${entity}`,
    tags: {
      audit: 'true',
      'reader.action': action,
      'reader.entity': entity,
      ...(userId ? { 'reader.user_id': userId } : {}),
      ...(actorEmail ? { 'reader.actor': actorEmail } : {}),
      ...(ipAddress ? { 'reader.ip': ipAddress } : {}),
    },
    extra: {
      action,
      entity,
      userId,
      actorEmail,
      detail,
      ipAddress,
      timestamp: new Date().toISOString(),
    },
  });
}
