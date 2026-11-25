import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock the entire @sentry/astro module
vi.mock('@sentry/astro', () => ({
  captureEvent: vi.fn(),
  captureMessage: vi.fn(),
}));

// Import after mocking
import * as Sentry from '@sentry/astro';
import { logAdminAction, logReaderAction } from './audit-log';

describe('logAdminAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses captureEvent with info level instead of captureMessage', () => {
    logAdminAction({
      action: 'create',
      entity: 'player',
      entityId: 42,
      actorEmail: 'admin@example.com',
      detail: 'name=Otto Pelz',
    });

    expect(Sentry.captureEvent).toHaveBeenCalledTimes(1);
    expect(Sentry.captureMessage).not.toHaveBeenCalled();

    const captureEventMock = Sentry.captureEvent as ReturnType<typeof vi.fn>;
    const callArgs = captureEventMock.mock.calls[0][0];
    expect(callArgs.level).toBe('info');
    expect(callArgs.message).toBe('admin.create.player');
    expect(callArgs.tags).toEqual({
      audit: 'true',
      'admin.action': 'create',
      'admin.entity': 'player',
      'admin.entity_id': '42',
      'admin.actor': 'admin@example.com',
    });
    expect(callArgs.extra).toEqual({
      action: 'create',
      entity: 'player',
      entityId: 42,
      actorEmail: 'admin@example.com',
      detail: 'name=Otto Pelz',
      timestamp: expect.any(String),
    });
  });

  it('handles optional entityId', () => {
    logAdminAction({
      action: 'update',
      entity: 'article',
      actorEmail: 'admin@example.com',
      detail: 'title=Test',
    });

    const captureEventMock = Sentry.captureEvent as ReturnType<typeof vi.fn>;
    const callArgs = captureEventMock.mock.calls[0][0];
    expect(callArgs.message).toBe('admin.update.article');
    expect(callArgs.tags).toEqual({
      audit: 'true',
      'admin.action': 'update',
      'admin.entity': 'article',
      'admin.actor': 'admin@example.com',
    });
    expect(callArgs.extra.entityId).toBeUndefined();
  });

  it('handles optional actorEmail', () => {
    logAdminAction({
      action: 'delete',
      entity: 'player',
      entityId: 99,
      detail: 'name=Test Player',
    });

    const captureEventMock = Sentry.captureEvent as ReturnType<typeof vi.fn>;
    const callArgs = captureEventMock.mock.calls[0][0];
    expect(callArgs.message).toBe('admin.delete.player');
    expect(callArgs.tags).toEqual({
      audit: 'true',
      'admin.action': 'delete',
      'admin.entity': 'player',
      'admin.entity_id': '99',
    });
    expect(callArgs.extra.actorEmail).toBeUndefined();
  });
});

describe('logReaderAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('protokolliert Reader-Aktionen mit reader-Präfix und IP', () => {
    logReaderAction({
      action: 'delete',
      entity: 'account-deletion',
      userId: 'user-123',
      actorEmail: 'user@example.org',
      detail: 'Konto endgültig gelöscht',
      ipAddress: '203.0.113.42',
    });

    expect(Sentry.captureEvent).toHaveBeenCalledTimes(1);
    const callArgs = (Sentry.captureEvent as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(callArgs.level).toBe('info');
    expect(callArgs.message).toBe('reader.delete.account-deletion');
    expect(callArgs.tags).toEqual({
      audit: 'true',
      'reader.action': 'delete',
      'reader.entity': 'account-deletion',
      'reader.user_id': 'user-123',
      'reader.actor': 'user@example.org',
      'reader.ip': '203.0.113.42',
    });
    expect(callArgs.extra).toEqual({
      action: 'delete',
      entity: 'account-deletion',
      userId: 'user-123',
      actorEmail: 'user@example.org',
      detail: 'Konto endgültig gelöscht',
      ipAddress: '203.0.113.42',
      timestamp: expect.any(String),
    });
  });

  it('lässt optionale Felder weg', () => {
    logReaderAction({
      action: 'confirm',
      entity: 'account-deletion',
      detail: 'Ungültiges Token',
    });

    const callArgs = (Sentry.captureEvent as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(callArgs.message).toBe('reader.confirm.account-deletion');
    expect(callArgs.tags).toEqual({
      audit: 'true',
      'reader.action': 'confirm',
      'reader.entity': 'account-deletion',
    });
    expect(callArgs.extra.userId).toBeUndefined();
    expect(callArgs.extra.actorEmail).toBeUndefined();
    expect(callArgs.extra.ipAddress).toBeUndefined();
  });
});
