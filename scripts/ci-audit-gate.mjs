import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { URL } from 'node:url';

const acceptedAdvisories = new Map([
  [
    'ghsa-vfj7-8cjw-p6xm',
    'braces <=3.0.3: no patched npm release is available yet',
  ],
  [
    'ghsa-ch52-4w7c-c8xp',
    'http-cache-semantics <=4.2.0: no patched npm release is available yet',
  ],
]);

const expectedAcceptedPackages = new Map([
  ['braces', { version: '3.0.3', devOnly: true, parent: 'micromatch' }],
  [
    'http-cache-semantics',
    { version: '4.2.0', devOnly: false, parent: 'astro' },
  ],
]);

const lock = JSON.parse(
  readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'),
);
const packages = lock.packages ?? {};

const assertAcceptedDependencyShape = (name) => {
  const expected = expectedAcceptedPackages.get(name);
  if (!expected) return false;

  const entry = packages[`node_modules/${name}`];
  if (!entry || entry.version !== expected.version) return false;
  if (Boolean(entry.dev) !== expected.devOnly) return false;

  const parentEntry = packages[`node_modules/${expected.parent}`];
  return Boolean(
    parentEntry?.dependencies?.[name] ||
      parentEntry?.optionalDependencies?.[name],
  );
};

const severityRank = {
  info: 0,
  low: 1,
  moderate: 2,
  high: 3,
  critical: 4,
};

const audit = spawnSync('npm', ['audit', '--json', '--audit-level=high'], {
  encoding: 'utf8',
  maxBuffer: 10 * 1024 * 1024,
});

if (audit.error) throw audit.error;

let report;
try {
  report = JSON.parse(audit.stdout);
} catch {
  process.stderr.write(audit.stdout);
  process.stderr.write(audit.stderr);
  throw new Error('npm audit hat kein gültiges JSON geliefert.');
}

if (report.error) {
  process.stderr.write(`${JSON.stringify(report.error, null, 2)}\n`);
  process.exit(1);
}

const vulnerabilities = report.vulnerabilities ?? {};
const acceptedSeen = new Set();

const advisoryId = (via) => {
  const match = via.url?.match(/GHSA-[0-9a-z-]+/i);
  return match?.[0]?.toLowerCase();
};

const isAccepted = (name, seen = new Set()) => {
  if (seen.has(name)) return false;
  seen.add(name);

  const vulnerability = vulnerabilities[name];
  if (!vulnerability) return false;

  let hasHighOrCriticalVia = false;

  for (const via of vulnerability.via ?? []) {
    if (typeof via === 'string') {
      hasHighOrCriticalVia = true;
      if (!isAccepted(via, new Set(seen))) return false;
      continue;
    }

    if ((severityRank[via.severity] ?? 0) < severityRank.high) continue;
    hasHighOrCriticalVia = true;

    const id = advisoryId(via);
    if (!id || !acceptedAdvisories.has(id)) return false;
    if (!assertAcceptedDependencyShape(name)) return false;
    acceptedSeen.add(id);
  }

  return hasHighOrCriticalVia;
};

const blocked = Object.entries(vulnerabilities)
  .filter(([, vulnerability]) => {
    return (severityRank[vulnerability.severity] ?? 0) >= severityRank.high;
  })
  .filter(([name]) => !isAccepted(name));

if (blocked.length) {
  process.stderr.write('Nicht akzeptierte High/Critical-Abhängigkeiten gefunden:\n');
  for (const [name, vulnerability] of blocked) {
    process.stderr.write(`- ${name}: ${vulnerability.severity}\n`);
  }
  process.exit(1);
}

const high = report.metadata?.vulnerabilities?.high ?? 0;
const critical = report.metadata?.vulnerabilities?.critical ?? 0;

if (high || critical) {
  process.stdout.write(
    `npm audit meldet ${high} high und ${critical} critical; alle stammen ausschließlich aus dokumentiert akzeptierten, derzeit ungefixten Advisories.\n`,
  );
  for (const id of [...acceptedSeen].sort()) {
    process.stdout.write(`- ${id}: ${acceptedAdvisories.get(id)}\n`);
  }
} else {
  process.stdout.write(
    'npm audit: keine High/Critical-Abhängigkeiten gefunden.\n',
  );
}
