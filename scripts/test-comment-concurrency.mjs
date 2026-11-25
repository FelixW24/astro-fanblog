import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import console from 'node:console';

const reader = randomUUID();
const slug = `rate-concurrency-${reader}`;
const args = [
  'exec',
  '-i',
  'supabase_db_blog',
  'psql',
  '-X',
  '-qAt',
  '-U',
  'postgres',
  '-d',
  'postgres',
  '-v',
  'ON_ERROR_STOP=1',
];
const sql = (input) =>
  execFileSync('docker', args, { input, encoding: 'utf8' }).trim();
const run = (input) =>
  new Promise((resolve, reject) => {
    const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    let error = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
    });
    child.stderr.on('data', (chunk) => {
      error += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, output, error }));
    child.stdin.end(input);
  });

try {
  const article = sql(`
    begin;
    insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data)
      values('${reader}','${reader}@concurrency.invalid',now(),'{}');
    insert into public.reader_profiles(id,username,avatar)
      values('${reader}','r_${reader.replaceAll('-', '').slice(0, 20)}','male');
    insert into public.articles(slug,title,excerpt,content,category,status,published_at)
      values('${slug}','Concurrency Test','Ein ausreichend langer Teaser.','Testinhalt.','news','published',now()-interval '1 day') returning id;
    commit;
  `);
  assert.match(article, /^\d+$/);
  // Hold the same profile lock as the trigger until all workers have started.
  // This exercises competing transactions, not sequential calls in one session.
  const lock = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });
  const ready = new Promise((resolve, reject) => {
    let output = '';
    lock.stdout.on('data', (chunk) => {
      output += chunk;
      if (output.includes('ready')) resolve();
    });
    lock.on('error', reject);
    lock.on('close', (code) => {
      if (!output.includes('ready'))
        reject(new Error(`Lock setup failed: ${code}`));
    });
  });
  const closed = new Promise((resolve) => lock.on('close', resolve));
  lock.stdin.write(
    `begin; select id from public.reader_profiles where id='${reader}' for update; select 'ready';\n`,
  );
  await ready;
  const pending = Array.from({ length: 20 }, (_, index) =>
    run(`
    begin;
    set local role authenticated;
    set local request.jwt.claims = '{"sub":"${reader}","role":"authenticated"}';
    ${
      index % 2 === 0
        ? `select * from public.submit_comment(${article},'Parallel ${index}');`
        : `insert into public.comments(article_id,user_id,body) values(${article},'${reader}','Parallel ${index}');`
    }
    commit;
  `),
  );
  lock.stdin.end('commit;\n');
  await closed;
  const results = await Promise.all(pending);
  assert.equal(
    results.filter((r) => r.code === 0).length,
    10,
    'Exactly ten concurrent submissions may commit',
  );
  assert.equal(
    results.filter(
      (r) => r.code !== 0 && r.error.includes('comment_rate_limited'),
    ).length,
    10,
    'Excess submissions must fail with the rate limit',
  );
  assert.equal(
    sql(`select count(*) from public.comments where user_id='${reader}';`),
    '10',
  );
  console.log(
    'PASS: concurrent RPC/direct submissions share one atomic budget',
  );
} finally {
  sql(
    `begin; delete from auth.users where id='${reader}'; delete from public.articles where slug='${slug}'; commit;`,
  );
}
