import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { minimumAgeError } from './reader';

vi.mock('@sentry/astro', () => ({
  captureEvent: vi.fn(),
  captureMessage: vi.fn(),
}));

import * as Sentry from '@sentry/astro';
import {
  composeUserRows,
  deleteUserAccount,
  deleteUserAvatar,
  fetchAllAuthUsers,
  filterUserRows,
  listAdminUsers,
  paginateUserRows,
  parseAdminProfileForm,
  parseUserListParams,
  removeAvatarFiles,
  roleLabel,
  setUserEditorRole,
  setUserGhost,
  splitFullName,
  updateUserProfile,
  userListPageSize,
  userListQuery,
  type AdminUserRow,
} from './admin-users';

const actor = {
  id: 'admin-id',
  email: 'admin@example.org',
  app_metadata: { is_editor: true, is_admin: true },
} as unknown as User;

// Kette, die bei await das zur letzten Methode passende Ergebnis liefert.
function fakeTable(results: Record<string, unknown>, calls: unknown[] = []) {
  let last = 'default';
  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          const result = results[last] ?? { data: null, error: null };
          return (resolve: (value: unknown) => unknown) =>
            Promise.resolve(result).then(resolve);
        }
        return (...args: unknown[]) => {
          last = String(prop);
          calls.push([last, args]);
          return proxy;
        };
      },
    },
  );
  return { proxy: proxy as SupabaseClient<Database>, calls };
}

function fakeAdminClient(options: {
  usersPages?: unknown[][];
  getUserById?: unknown;
  updateUserByIdError?: unknown;
  deleteUserError?: unknown;
  tables?: Record<string, Record<string, unknown>>;
  tableCalls?: Record<string, unknown[]>;
  storageList?: unknown;
  storageRemove?: unknown;
}) {
  const calls = {
    listUsers: [] as unknown[],
    getUserById: [] as unknown[],
    updateUserById: [] as unknown[],
    deleteUser: [] as unknown[],
    storageList: [] as unknown[],
    storageRemove: [] as unknown[],
  };
  const tableProxies: Record<string, ReturnType<typeof fakeTable>> = {};
  const admin = {
    auth: {
      admin: {
        listUsers: vi.fn(async ({ page, perPage }: never) => {
          calls.listUsers.push([page, perPage]);
          const users = options.usersPages?.[page - 1] ?? [];
          return { data: { users }, error: null };
        }),
        getUserById: vi.fn(async (id: string) => {
          calls.getUserById.push([id]);
          const result = options.getUserById ?? { user: null };
          return 'error' in (result as object)
            ? result
            : { data: result, error: null };
        }),
        updateUserById: vi.fn(async (id: string, attrs: unknown) => {
          calls.updateUserById.push([id, attrs]);
          return options.updateUserByIdError
            ? { data: { user: null }, error: options.updateUserByIdError }
            : {
                data: {
                  user: {
                    id,
                    app_metadata: (attrs as { app_metadata?: unknown })
                      .app_metadata,
                  },
                },
                error: null,
              };
        }),
        deleteUser: vi.fn(async (id: string) => {
          calls.deleteUser.push([id]);
          return options.deleteUserError
            ? { data: null, error: options.deleteUserError }
            : { data: {}, error: null };
        }),
      },
    },
    from: (table: string) => {
      if (!tableProxies[table]) {
        tableProxies[table] = fakeTable(
          options.tables?.[table] ?? {},
          options.tableCalls?.[table] ?? [],
        );
      }
      return tableProxies[table].proxy;
    },
    storage: {
      from: () => ({
        list: vi.fn(async (...args: unknown[]) => {
          calls.storageList.push(args);
          return options.storageList ?? { data: [], error: null };
        }),
        remove: vi.fn(async (...args: unknown[]) => {
          calls.storageRemove.push(args);
          return options.storageRemove ?? { data: [], error: null };
        }),
      }),
    },
  } as unknown as SupabaseClient<Database>;
  return { admin, calls, tableProxies };
}

function fakeRequestClient(options: {
  factors?: unknown[];
  factorsError?: unknown;
  challengeError?: unknown;
}) {
  const calls = { listFactors: 0, challengeAndVerify: [] as unknown[] };
  const client = {
    auth: {
      mfa: {
        listFactors: vi.fn(async () => {
          calls.listFactors += 1;
          return options.factorsError
            ? { data: null, error: options.factorsError }
            : { data: { totp: options.factors ?? [] }, error: null };
        }),
        challengeAndVerify: vi.fn(async (args: unknown) => {
          calls.challengeAndVerify.push([args]);
          return options.challengeError
            ? { data: null, error: options.challengeError }
            : { data: {}, error: null };
        }),
      },
    },
  } as unknown as SupabaseClient<Database>;
  return { client, calls };
}

function profileForm(overrides: Record<string, string> = {}) {
  const form = new FormData();
  form.set('username', 'leser_48');
  form.set('first_name', 'Max');
  form.set('last_name', 'Mustermann');
  form.set('birth_date', '1990-05-17');
  for (const [key, value] of Object.entries(overrides)) form.set(key, value);
  return form;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('parseUserListParams', () => {
  it('liefert Defaults und normalisiert Suche und Seite', () => {
    expect(parseUserListParams(new URLSearchParams())).toEqual({
      search: '',
      role: 'alle',
      page: 1,
    });
    expect(
      parseUserListParams(
        new URLSearchParams(
          'suche=  ADMIN@Example.ORG  &rolle=geister&seite=3',
        ),
      ),
    ).toEqual({ search: 'admin@example.org', role: 'geister', page: 3 });
  });

  it('fällt bei ungültiger Rolle und Seite auf sichere Werte zurück', () => {
    expect(
      parseUserListParams(new URLSearchParams('rolle=superadmin&seite=-5')),
    ).toEqual({ search: '', role: 'alle', page: 1 });
    expect(parseUserListParams(new URLSearchParams('seite=99999')).page).toBe(
      10000,
    );
    expect(
      parseUserListParams(new URLSearchParams(`suche=${'x'.repeat(200)}`))
        .search.length,
    ).toBe(120);
  });
});

describe('userListQuery', () => {
  it('baut die Query nur mit gesetzten Filtern', () => {
    expect(userListQuery({ search: '', role: 'alle', page: 1 }, 1)).toBe('');
    expect(userListQuery({ search: 'max', role: 'leser', page: 2 }, 3)).toBe(
      '?suche=max&rolle=leser&seite=3',
    );
  });
});

describe('composeUserRows / filterUserRows / paginateUserRows', () => {
  const rows: AdminUserRow[] = composeUserRows(
    [
      {
        id: 'a',
        email: 'a@example.org',
        created_at: '2026-01-01',
        app_metadata: { is_editor: true, is_admin: true },
      },
      {
        id: 'b',
        email: 'b@example.org',
        created_at: '2026-03-01',
        app_metadata: { is_editor: true },
      },
      {
        id: 'c',
        email: 'c@example.org',
        created_at: '2026-02-01',
        app_metadata: {},
      },
    ],
    [
      { id: 'b', username: 'redakteur', avatar_url: null, is_ghost: false },
      {
        id: 'c',
        username: 'geist',
        avatar_url: 'c/avatar.webp',
        is_ghost: true,
      },
    ],
  );

  it('ordnet Admin vor Redaktion vor Leser und sortiert nach Erstellungsdatum', () => {
    expect(rows.map((row) => row.id)).toEqual(['b', 'c', 'a']);
    expect(rows.map((row) => row.role)).toEqual([
      'redaktion',
      'leser',
      'admin',
    ]);
    expect(roleLabel('admin')).toBe('Admin');
  });

  it('filtert nach Rolle, Geistermodus und Suche (E-Mail oder Username)', () => {
    expect(
      filterUserRows(rows, { search: '', role: 'leser' }).map((r) => r.id),
    ).toEqual(['c']);
    expect(
      filterUserRows(rows, { search: '', role: 'redaktion' }).map((r) => r.id),
    ).toEqual(['b', 'a']);
    expect(
      filterUserRows(rows, { search: '', role: 'geister' }).map((r) => r.id),
    ).toEqual(['c']);
    expect(
      filterUserRows(rows, { search: 'A@EXAMPLE', role: 'alle' }).map(
        (r) => r.id,
      ),
    ).toEqual(['a']);
    expect(
      filterUserRows(rows, { search: 'geist', role: 'alle' }).map((r) => r.id),
    ).toEqual(['c']);
    expect(filterUserRows(rows, { search: 'unbekannt', role: 'alle' })).toEqual(
      [],
    );
  });

  it('paginiert und begrenzt die Seite auf den gültigen Bereich', () => {
    const many = Array.from({ length: userListPageSize + 1 }, (_, i) => ({
      ...rows[0],
      id: `u${i}`,
    }));
    const page2 = paginateUserRows(many, 2);
    expect(page2.pageCount).toBe(2);
    expect(page2.users).toHaveLength(1);
    expect(page2.total).toBe(userListPageSize + 1);
    expect(paginateUserRows(many, 99).page).toBe(2);
    expect(paginateUserRows([], 5).pageCount).toBe(1);
  });
});

describe('fetchAllAuthUsers / listAdminUsers', () => {
  it('lädt alle Auth-Seiten und hängt Profile in Batches an', async () => {
    const firstPage = Array.from({ length: 200 }, (_, i) => ({
      id: `u${i}`,
      email: `u${i}@example.org`,
      created_at: '2026-01-01',
      app_metadata: {},
    }));
    const secondPage = [
      {
        id: 'admin-1',
        email: 'admin@example.org',
        created_at: '2026-05-01',
        app_metadata: { is_editor: true, is_admin: true },
      },
    ];
    const { admin, calls } = fakeAdminClient({
      usersPages: [firstPage, secondPage],
      tables: {
        reader_profiles: {
          in: {
            data: [
              {
                id: 'admin-1',
                username: 'admin',
                avatar_url: null,
                is_ghost: false,
              },
            ],
            error: null,
          },
        },
      },
    });
    const all = await fetchAllAuthUsers(admin);
    expect(all).toHaveLength(201);
    expect(calls.listUsers).toEqual([
      [1, 200],
      [2, 200],
    ]);
    const result = await listAdminUsers(admin, {
      search: 'admin@example',
      role: 'alle',
      page: 1,
    });
    expect(result.total).toBe(1);
    expect(result.users[0]).toMatchObject({
      id: 'admin-1',
      role: 'admin',
      username: 'admin',
    });
  });

  it('liefert leere Liste bei Auth-Fehler', async () => {
    const { admin } = fakeAdminClient({});
    (admin.auth.admin.listUsers as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: null,
      error: { message: 'down' },
    });
    expect(await fetchAllAuthUsers(admin)).toEqual([]);
  });
});

describe('splitFullName', () => {
  it('schlägt die Aufteilung bestehender Namen vor', () => {
    expect(splitFullName('Max Mustermann')).toEqual({
      firstName: 'Max',
      lastName: 'Mustermann',
    });
    expect(splitFullName('Anna Maria Beispiel')).toEqual({
      firstName: 'Anna Maria',
      lastName: 'Beispiel',
    });
    expect(splitFullName('Cher')).toEqual({ firstName: 'Cher', lastName: '' });
    expect(splitFullName('   ')).toEqual({ firstName: '', lastName: '' });
  });
});

describe('parseAdminProfileForm', () => {
  it('akzeptiert gültige Angaben und setzt full_name zusammen', () => {
    const { values, error } = parseAdminProfileForm(
      profileForm({
        username: '  Leser_48 ',
        first_name: '  Max  ',
        last_name: 'Mustermann',
      }),
      '2026-06-01',
    );
    expect(error).toBeNull();
    expect(values).toMatchObject({
      username: 'leser_48',
      firstName: 'Max',
      lastName: 'Mustermann',
      fullName: 'Max Mustermann',
      birthDate: '1990-05-17',
    });
  });

  it.each([
    ['Username-Format', { username: 'Kein Name!' }, 'Username'],
    ['Name zu kurz', { first_name: '', last_name: 'M' }, '2 bis 120'],
    ['Name zu lang', { first_name: 'x'.repeat(130) }, '2 bis 120'],
    ['Geburtsdatum ungültig', { birth_date: '17.05.1990' }, 'Geburtsdatum'],
    [
      'Geburtsdatum in der Zukunft',
      { birth_date: '2999-01-01' },
      'Geburtsdatum',
    ],
    ['Geburtsdatum vor 1900', { birth_date: '1899-12-31' }, 'Geburtsdatum'],
    ['Mindestalter', { birth_date: '2020-01-01' }, minimumAgeError],
  ])('weist %s zurück', (_label, overrides, message) => {
    const { error } = parseAdminProfileForm(
      profileForm(overrides),
      '2026-06-01',
    );
    expect(error).toContain(message === minimumAgeError ? '13' : message);
  });

  it('akzeptiert den 13. Geburtstag am Stichtag', () => {
    const { error } = parseAdminProfileForm(
      profileForm({ birth_date: '2013-06-01' }),
      '2026-06-01',
    );
    expect(error).toBeNull();
  });
});

describe('updateUserProfile', () => {
  const values = {
    username: 'neuer_name',
    firstName: 'Max',
    lastName: 'Mustermann',
    fullName: 'Max Mustermann',
    birthDate: '1990-05-17',
  };

  it('speichert Username und Details und protokolliert nur Feldnamen', async () => {
    const { admin, tableProxies } = fakeAdminClient({
      tables: {
        reader_profiles: { select: { data: [{ id: 'target' }], error: null } },
        reader_details: { upsert: { data: null, error: null } },
      },
    });
    const error = await updateUserProfile(admin, actor, 'target', values);
    expect(error).toBeNull();
    const profileCalls = tableProxies.reader_profiles.calls;
    expect(profileCalls).toContainEqual([
      'update',
      [{ username: 'neuer_name' }],
    ]);
    const detailsCalls = tableProxies.reader_details.calls;
    expect(detailsCalls).toContainEqual([
      'upsert',
      [
        { id: 'target', full_name: 'Max Mustermann', birth_date: '1990-05-17' },
        { onConflict: 'id' },
      ],
    ]);
    const event = vi.mocked(Sentry.captureEvent).mock.calls[0][0] as never;
    expect(event).toMatchObject({
      tags: { 'admin.entity': 'user_profile', 'admin.entity_id': 'target' },
    });
    expect(JSON.stringify(event)).toContain('username,full_name,birth_date');
    expect(JSON.stringify(event)).not.toContain('1990-05-17');
    expect(JSON.stringify(event)).not.toContain('Max Mustermann');
  });

  it('meldet doppelte und reservierte Usernamen aus den DB-Fehlern', async () => {
    const duplicate = fakeAdminClient({
      tables: {
        reader_profiles: {
          select: {
            data: null,
            error: { code: '23505', message: 'duplicate key' },
          },
        },
      },
    });
    expect(
      await updateUserProfile(duplicate.admin, actor, 't', values),
    ).toContain('bereits vergeben');
    const reserved = fakeAdminClient({
      tables: {
        reader_profiles: {
          select: {
            data: null,
            error: {
              code: 'P0001',
              message: 'Dieser Benutzername ist reserviert.',
            },
          },
        },
      },
    });
    expect(
      await updateUserProfile(reserved.admin, actor, 't', values),
    ).toContain('reserviert');
  });

  it('weist Konten ohne Leserprofil und Altersverstöße in den Details zurück', async () => {
    const noProfile = fakeAdminClient({
      tables: { reader_profiles: { select: { data: [], error: null } } },
    });
    expect(
      await updateUserProfile(noProfile.admin, actor, 't', values),
    ).toContain('kein Leserprofil');
    const tooYoung = fakeAdminClient({
      tables: {
        reader_profiles: { select: { data: [{ id: 't' }], error: null } },
        reader_details: {
          upsert: {
            data: null,
            error: {
              code: '23514',
              message: 'reader_details_birth_date_check',
            },
          },
        },
      },
    });
    expect(await updateUserProfile(tooYoung.admin, actor, 't', values)).toBe(
      minimumAgeError,
    );
  });
});

describe('setUserEditorRole', () => {
  it('schützt Admin-Konten vor Herabstufung', async () => {
    const { admin, calls } = fakeAdminClient({
      getUserById: {
        user: { id: 't', app_metadata: { is_admin: true, is_editor: true } },
      },
    });
    expect(await setUserEditorRole(admin, actor, 't', false)).toContain(
      'nicht herabgestuft',
    );
    expect(calls.updateUserById).toEqual([]);
  });

  it('ist eine No-Op bei unveränderter Rolle und nennt fehlende Konten', async () => {
    const same = fakeAdminClient({
      getUserById: { user: { id: 't', app_metadata: { is_editor: true } } },
    });
    expect(await setUserEditorRole(same.admin, actor, 't', true)).toBeNull();
    expect(same.calls.updateUserById).toEqual([]);
    const missing = fakeAdminClient({
      getUserById: { error: { message: 'nf' } },
    });
    expect(await setUserEditorRole(missing.admin, actor, 't', true)).toContain(
      'nicht gefunden',
    );
  });

  it('setzt is_editor serverseitig und erhält andere Metadaten', async () => {
    const { admin, calls } = fakeAdminClient({
      getUserById: {
        user: {
          id: 't',
          app_metadata: {
            is_editor: false,
            provider: 'email',
            is_admin: false,
          },
        },
      },
    });
    expect(await setUserEditorRole(admin, actor, 't', true)).toBeNull();
    expect(calls.updateUserById).toEqual([
      [
        't',
        {
          app_metadata: { is_editor: true, provider: 'email', is_admin: false },
        },
      ],
    ]);
  });

  it('legt beim Herabstufen ein fehlendes Leserprofil nach', async () => {
    const { admin, calls, tableProxies } = fakeAdminClient({
      getUserById: { user: { id: 't', app_metadata: { is_editor: true } } },
      tables: {
        reader_profiles: {
          maybeSingle: { data: null, error: null },
          insert: { data: null, error: null },
        },
      },
    });
    expect(await setUserEditorRole(admin, actor, 't', false)).toBeNull();
    expect(calls.updateUserById[0] as unknown[]).toEqual([
      't',
      { app_metadata: { is_editor: false } },
    ]);
    expect(tableProxies.reader_profiles.calls).toContainEqual([
      'insert',
      [{ id: 't', username: 'redaktion_t', avatar: 'male' }],
    ]);
  });

  it('meldet Auth-Fehler beim Rollenwechsel', async () => {
    const { admin } = fakeAdminClient({
      getUserById: { user: { id: 't', app_metadata: {} } },
      updateUserByIdError: { message: 'down' },
    });
    expect(await setUserEditorRole(admin, actor, 't', true)).toContain(
      'nicht geändert',
    );
  });
});

describe('removeAvatarFiles / deleteUserAvatar', () => {
  it('entfernt alle Dateien des Nutzer-Ordners und ist wiederholbar', async () => {
    const { admin, calls } = fakeAdminClient({
      storageList: { data: [{ name: 'avatar.webp' }], error: null },
    });
    expect(await removeAvatarFiles(admin, 'u1')).toBeNull();
    expect(calls.storageRemove).toEqual([[['u1/avatar.webp']]]);
    const empty = fakeAdminClient({ storageList: { data: [], error: null } });
    expect(await removeAvatarFiles(empty.admin, 'u1')).toBeNull();
    expect(empty.calls.storageRemove).toEqual([]);
  });

  it('meldet Storage-Fehler', async () => {
    const listFail = fakeAdminClient({
      storageList: { data: null, error: { message: 'down' } },
    });
    expect(await removeAvatarFiles(listFail.admin, 'u1')).toContain(
      ' aufgelistet',
    );
    const removeFail = fakeAdminClient({
      storageList: { data: [{ name: 'avatar.png' }], error: null },
      storageRemove: { data: null, error: { message: 'denied' } },
    });
    expect(await removeAvatarFiles(removeFail.admin, 'u1')).toContain(
      'nicht aus dem Speicher entfernt',
    );
  });

  it('setzt avatar_url zurück und meldet Storage-Fehler als erneut ausführbar', async () => {
    const failing = fakeAdminClient({
      storageRemove: { data: null, error: { message: 'denied' } },
      storageList: { data: [{ name: 'avatar.webp' }], error: null },
      tables: { reader_profiles: { eq: { data: [{ id: 't' }], error: null } } },
    });
    const error = await deleteUserAvatar(failing.admin, actor, 't');
    expect(error).toContain('Speicher');
    expect(failing.tableProxies.reader_profiles.calls).toContainEqual([
      'update',
      [{ avatar_url: null }],
    ]);
    const ok = fakeAdminClient({
      tables: { reader_profiles: { eq: { data: [{ id: 't' }], error: null } } },
    });
    expect(await deleteUserAvatar(ok.admin, actor, 't')).toBeNull();
  });
});

describe('setUserGhost', () => {
  it('schützt Admin-Konten und löscht beim Aktivieren das Profilbild', async () => {
    const adminTarget = fakeAdminClient({
      getUserById: { user: { id: 't', app_metadata: { is_admin: true } } },
    });
    expect(await setUserGhost(adminTarget.admin, actor, 't', true)).toContain(
      'Geistermodus',
    );
    const { admin, calls, tableProxies } = fakeAdminClient({
      getUserById: { user: { id: 't', app_metadata: {} } },
      storageList: { data: [{ name: 'avatar.webp' }], error: null },
      tables: {
        reader_profiles: {
          maybeSingle: { data: { id: 't' }, error: null },
          eq: { data: [{ id: 't' }], error: null },
        },
      },
    });
    expect(await setUserGhost(admin, actor, 't', true)).toBeNull();
    expect(calls.storageRemove).toEqual([[['t/avatar.webp']]]);
    expect(tableProxies.reader_profiles.calls).toContainEqual([
      'update',
      [{ is_ghost: true, avatar_url: null }],
    ]);
  });

  it('aktiviert ohne Storage-Blockade beim Deaktivieren', async () => {
    const { admin, calls, tableProxies } = fakeAdminClient({
      getUserById: { user: { id: 't', app_metadata: {} } },
      tables: {
        reader_profiles: {
          maybeSingle: { data: { id: 't' }, error: null },
          eq: { data: [{ id: 't' }], error: null },
        },
      },
    });
    expect(await setUserGhost(admin, actor, 't', false)).toBeNull();
    expect(calls.storageRemove).toEqual([]);
    expect(tableProxies.reader_profiles.calls).toContainEqual([
      'update',
      [{ is_ghost: false }],
    ]);
  });

  it('bricht beim Aktivieren ab, wenn das Profilbild nicht entfernt werden kann', async () => {
    const { admin, tableProxies } = fakeAdminClient({
      getUserById: { user: { id: 't', app_metadata: {} } },
      storageList: { data: [{ name: 'avatar.webp' }], error: null },
      storageRemove: { data: null, error: { message: 'denied' } },
      tables: {
        reader_profiles: { maybeSingle: { data: { id: 't' }, error: null } },
      },
    });
    expect(await setUserGhost(admin, actor, 't', true)).toContain('Speicher');
    expect(
      tableProxies.reader_profiles.calls.filter(
        (call) => (call as unknown[])[0] === 'update',
      ),
    ).toEqual([]);
  });
});

describe('deleteUserAccount', () => {
  const verifiedFactor = {
    id: 'factor-1',
    status: 'verified',
    factor_type: 'totp',
  };

  function deleteForm(overrides: Record<string, string> = {}) {
    const form = new FormData();
    form.set('confirm_delete', 'on');
    form.set('factor_id', 'factor-1');
    form.set('code', '123456');
    for (const [key, value] of Object.entries(overrides)) form.set(key, value);
    return form;
  }

  function setup(overrides: Parameters<typeof fakeAdminClient>[0] = {}) {
    const adminKit = fakeAdminClient({
      getUserById: { user: { id: 'target', app_metadata: {} } },
      storageList: { data: [{ name: 'avatar.webp' }], error: null },
      tables: {
        reader_profiles: { eq: { data: [{ id: 'target' }], error: null } },
      },
      ...overrides,
    });
    const request = fakeRequestClient({ factors: [verifiedFactor] });
    return { ...adminKit, request };
  }

  it('schließt Selbstlöschung und fehlende Bestätigung aus', async () => {
    const s = setup();
    expect(
      await deleteUserAccount(
        s.request.client,
        s.admin,
        actor,
        actor.id,
        deleteForm(),
      ),
    ).toContain('Selbstlöschung');
    const noConfirm = deleteForm();
    noConfirm.delete('confirm_delete');
    expect(
      await deleteUserAccount(
        s.request.client,
        s.admin,
        actor,
        'target',
        noConfirm,
      ),
    ).toContain('bestätige');
    expect(s.calls.deleteUser).toEqual([]);
  });

  it('löscht keine Admin-Konten', async () => {
    const s = setup({
      getUserById: { user: { id: 'target', app_metadata: { is_admin: true } } },
    });
    expect(
      await deleteUserAccount(
        s.request.client,
        s.admin,
        actor,
        'target',
        deleteForm(),
      ),
    ).toContain('Admin-Konten');
    expect(s.calls.deleteUser).toEqual([]);
  });

  it('verlangt einen eingerichteten zweiten Faktor', async () => {
    const s = setup();
    s.request.client.auth.mfa.listFactors = vi.fn(async () => ({
      data: { totp: [{ id: 'f', status: 'unverified' }] },
      error: null,
    })) as never;
    expect(
      await deleteUserAccount(
        s.request.client,
        s.admin,
        actor,
        'target',
        deleteForm(),
      ),
    ).toContain('zweiten Faktor');
    expect(s.calls.deleteUser).toEqual([]);
  });

  it('prüft den frischen TOTP-Code unmittelbar vor der Löschung', async () => {
    const s = setup();
    const badCode = deleteForm({ code: '12' });
    expect(
      await deleteUserAccount(
        s.request.client,
        s.admin,
        actor,
        'target',
        badCode,
      ),
    ).toContain('sechsstelligen');
    const wrongFactor = deleteForm({ factor_id: 'other' });
    expect(
      await deleteUserAccount(
        s.request.client,
        s.admin,
        actor,
        'target',
        wrongFactor,
      ),
    ).toContain('sechsstelligen');
    const s2 = setup();
    s2.request.client.auth.mfa.challengeAndVerify = vi.fn(async () => ({
      data: null,
      error: { message: 'invalid' },
    })) as never;
    expect(
      await deleteUserAccount(
        s2.request.client,
        s2.admin,
        actor,
        'target',
        deleteForm(),
      ),
    ).toContain('ungültig oder abgelaufen');
    expect(s2.calls.deleteUser).toEqual([]);
    expect(s.request.calls.challengeAndVerify).toEqual([]);
  });

  it('räumt Avatar-Dateien auf und löscht dann das Konto (wiederholbar)', async () => {
    const s = setup();
    expect(
      await deleteUserAccount(
        s.request.client,
        s.admin,
        actor,
        'target',
        deleteForm(),
      ),
    ).toBeNull();
    expect(s.request.calls.challengeAndVerify).toEqual([
      [{ factorId: 'factor-1', code: '123456' }],
    ]);
    expect(s.calls.storageRemove).toEqual([[['target/avatar.webp']]]);
    expect(s.calls.deleteUser).toEqual([['target']]);
    expect(s.calls.storageRemove[0] && s.calls.deleteUser[0]).toBeTruthy();
    const order = vi
      .mocked(Sentry.captureEvent)
      .mock.calls.at(-1)?.[0] as never;
    expect(order).toMatchObject({
      tags: {
        'admin.action': 'delete',
        'admin.entity': 'user_account',
        'admin.entity_id': 'target',
      },
    });
    expect(JSON.stringify(order)).not.toContain('123456');
  });

  it('löscht nicht, wenn das Storage-Aufräumen fehlschlägt', async () => {
    const s = setup({
      storageRemove: { data: null, error: { message: 'denied' } },
    });
    expect(
      await deleteUserAccount(
        s.request.client,
        s.admin,
        actor,
        'target',
        deleteForm(),
      ),
    ).toContain('Speicher');
    expect(s.calls.deleteUser).toEqual([]);
  });

  it('meldet Auth-Fehler bei der Löschung als nicht verfügbar', async () => {
    const s = setup({ deleteUserError: { message: 'down' } });
    expect(
      await deleteUserAccount(
        s.request.client,
        s.admin,
        actor,
        'target',
        deleteForm(),
      ),
    ).toContain('nicht verfügbar');
  });
});
