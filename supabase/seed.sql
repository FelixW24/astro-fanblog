insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
values (
  '00000000-0000-0000-0000-000000000000',
  '10000000-0000-0000-0000-000000000001',
  'authenticated',
  'authenticated',
  'admin@fanblog.local',
  extensions.crypt('Fanblog!2026', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"],"role":"admin","is_editor":true,"is_admin":true}'::jsonb,
  '{"display_name":"Astro Fanblog Redaktion"}'::jsonb,
  now(),
  now(),
  '', '', '', ''
);

insert into auth.identities (
  id, provider_id, user_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
)
values (
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '{"sub":"10000000-0000-0000-0000-000000000001","email":"admin@fanblog.local","email_verified":true}'::jsonb,
  'email',
  now(),
  now(),
  now()
);

insert into public.reader_profiles (id, username, avatar)
values ('10000000-0000-0000-0000-000000000001', 'redaktion', 'male');

insert into public.reader_details (id, full_name, birth_date)
values (
  '10000000-0000-0000-0000-000000000001',
  'Astro Fanblog Redaktion',
  '1990-01-01'
);

insert into private.editor_account (singleton, user_id, email)
values (true, '10000000-0000-0000-0000-000000000001', 'admin@fanblog.local');

insert into public.articles
  (slug, title, excerpt, content, category, status, author, read_minutes, is_featured, published_at)
values
  (
    'fuenf-beobachtungen-zum-heimauftakt',
    'Fünf Beobachtungen zum wilden Heimauftakt',
    'Drei Tore, mehrere Wendepunkte und eine Mannschaft, die auch in unruhigen Phasen bei ihrem Plan blieb: unsere Analyse des 3:2 gegen Hoffenheim.',
    E'Dieser Heimauftakt war kein Spiel für den Puls, aber eines für das Vertrauen. Der FC musste reagieren, Räume neu verteilen und bis in die Schlussphase konzentriert bleiben. Entscheidend war weniger ein einzelner Geistesblitz als die Bereitschaft, nach Ballverlusten gemeinsam nachzuschieben.\n\nIm Aufbau zeigte sich eine klare Idee: Die Außenverteidiger gaben Breite, während sich ein zentraler Spieler wiederholt zwischen die Linien fallen ließ. Dadurch entstanden Passwinkel, die Hoffenheims erste Pressinglinie auseinanderzogen. Nicht jede Lösung war sauber, doch die Struktur blieb erkennbar.\n\nGegen den Ball war das Bild gemischter. Sobald der erste Zugriff verpasst wurde, öffnete sich Platz vor der letzten Linie. Genau dort muss die Abstimmung in den kommenden Wochen besser werden. Positiv war die Reaktion nach Rückschlägen: keine Hektik, kein blindes Anrennen.\n\nDer größte Gewinn dieses Nachmittags ist deshalb nicht nur das Ergebnis. Es ist die Erfahrung, dass diese Mannschaft ein enges Spiel mit eigener Energie drehen kann. Für ein belastbares Urteil ist es zu früh – für einen ersten Fingerzeig aber nicht.',
    'spielbericht-analyse', 'published', 'Mara Schmitz', 7, true, '2026-08-30 09:30:00+02'
  ),
  (
    'pk-kompakt-vor-dem-heimauftakt',
    'PK kompakt: Geduld, Mut und ein klarer Auftrag',
    'Was vor dem ersten Ligaspiel wichtig war: Wir bündeln die zentralen Themen der Pressekonferenz und ordnen sie ein.',
    E'Die Botschaft vor dem Heimauftakt war eindeutig: Der FC will aktiv sein, ohne die Balance zu verlieren. Trainer und Mannschaft wissen, dass Euphorie allein keine Zweikämpfe gewinnt. Trotzdem soll die Energie von den Rängen ein Teil des Plans sein.\n\nPersonell blieb die Runde bewusst zurückhaltend. Statt einzelner Namen stand die Rollenverteilung im Vordergrund. Wer beginnt, soll Intensität vorgeben; wer später kommt, muss das Niveau halten oder erhöhen.\n\nTaktisch deutete vieles auf flexible Pressinghöhen hin. Nicht jede Phase soll maximal aggressiv angelaufen werden. Entscheidend ist, dass die Abstände stimmen und der Moment zum Herausrücken gemeinsam erkannt wird.\n\nUnsere Einordnung: Das klingt weniger spektakulär als große Kampfansagen, ist aber ein realistischer Ansatz für den Saisonstart. Die eigentliche Antwort musste auf dem Platz folgen.',
    'pk-zusammenfassung', 'published', 'Jonas Reuter', 4, false, '2026-08-28 13:00:00+02'
  ),
  (
    'beispiel-erweitert-die-optionen',
    'Beispiel erweitert die Optionen im Sturm',
    'Der neue Angreifer verändert nicht nur die Tiefe des Kaders. Sein Profil eröffnet auch im Positionsspiel andere Lösungen.',
    E'Mit Alex Beispiel gewinnt der FC einen Stürmertyp, der sich gern in der letzten Linie bewegt und im Strafraum klare Wege sucht. Das schafft eine andere Dynamik als ein Angreifer, der häufig entgegenkommt und das Spiel mit dem Rücken zum Tor verbindet.\n\nSpannend wird die Frage, welche Flügelprofile neben ihm eingesetzt werden. Frühe Hereingaben können an Wert gewinnen, gleichzeitig braucht es genügend Präsenz für zweite Bälle. Auch gegen tief stehende Gegner bietet seine Bewegung zwischen Innen- und Außenverteidiger neue Ansatzpunkte.\n\nEine Leihe ist immer auch eine Abwägung zwischen sofortiger Hilfe und langfristiger Planung. Für diese Saison ist das Signal aber klar: Im letzten Drittel soll mehr Konkurrenz und mehr Variabilität entstehen.',
    'transfer', 'published', 'Mara Schmitz', 5, false, '2026-08-18 18:00:00+02'
  ),
  (
    'trainingswoche-in-drei-notizen',
    'Trainingswoche in drei Notizen',
    'Intensität im Gegenpressing, neue Paarungen und viele kurze Gespräche: Das fiel rund um das Trainingsgelände auf.',
    E'Die Belastung wurde im Verlauf der Woche sichtbar gesteuert. Auf intensive Spielformen folgten ruhigere technische Sequenzen – ein typischer Rhythmus zwischen zwei Pflichtspielen.\n\nAuffällig waren wechselnde Paarungen im Zentrum. Das Trainerteam testete, welche Kombinationen unter Druck schnell genug Anschluss finden. Daraus lässt sich noch keine Startelf lesen, wohl aber ein Schwerpunkt.\n\nAm Rand gab es immer wieder kurze Einzelgespräche. Gerade in einer frühen Saisonphase helfen diese Korrekturen, gemeinsame Begriffe und Abläufe zu schärfen.',
    'news', 'published', 'Redaktion', 3, false, '2026-08-27 17:15:00+02'
  ),
  (
    'warum-stadionviertel-nie-nur-kulisse-ist',
    'Warum das Stadionviertel nie nur Kulisse ist',
    'Zwischen Bahnsteig, Stadionwurst und den ersten Takten der Hymne entsteht ein Spieltag lange vor dem Anpfiff.',
    E'Ein Heimspiel beginnt nicht mit dem Anstoß. Es beginnt in einer vollen Bahn, an der nächsten Straßenecke oder mit dem ersten vereinsfarbenen Schal, der am Fenster vorbeizieht. Stadionviertel ist an diesen Tagen kein Zielpunkt, sondern ein gemeinsamer Weg.\n\nRituale wirken nebensächlich, bis sie fehlen. Der gleiche Treffpunkt, dieselbe Runde um das Stadion, ein kurzer Blick auf die Aufstellung: All das ordnet die Nervosität.\n\nVielleicht liegt genau darin die besondere Kraft dieses Ortes. Das Stadion verstärkt nicht nur das Spiel. Es sammelt tausende kleine Geschichten und gibt ihnen für neunzig Minuten einen gemeinsamen Takt.',
    'weiteres', 'published', 'Lea Franken', 4, false, '2026-08-22 10:00:00+02'
  );

insert into public.players (slug, name, shirt_number, position, squad_status)
values
  ('lukas-luecke', 'Lukas Lücke', 1, 'torwart', 'first-team'),
  ('ben-braun', 'Ben Braun', 20, 'torwart', 'first-team'),
  ('chris-gruen', 'Chris Grün', 21, 'torwart', 'first-team'),
  ('david-draht', 'David Draht', 44, 'torwart', 'first-team'),
  ('elias-engel', 'Elias Engel', 2, 'abwehr', 'first-team'),
  ('finn-fricke', 'Finn Fricke', 3, 'abwehr', 'first-team'),
  ('jan-jung', 'Jan Jung', 4, 'abwehr', 'first-team'),
  ('leon-lange', 'Leon Lange', 14, 'abwehr', 'first-team'),
  ('max-muster', 'Max Muster', 17, 'abwehr', 'first-team'),
  ('noah-nordmann', 'Noah Nordmann', 22, 'abwehr', 'first-team'),
  ('oskar-ostermann', 'Oskar Ostermann', 24, 'abwehr', 'first-team'),
  ('paul-peters', 'Paul Peters', 28, 'abwehr', 'first-team'),
  ('quirin-quast', 'Quirin Quast', 33, 'abwehr', 'first-team'),
  ('rene-richter', 'Rene Richter', null, 'abwehr', 'first-team'),
  ('sam-schulz', 'Sam Schulz', 5, 'mittelfeld', 'first-team'),
  ('tim-thomas', 'Tim Thomas', 6, 'mittelfeld', 'first-team'),
  ('uwe-ulrich', 'Uwe Ulrich', 8, 'mittelfeld', 'first-team'),
  ('victor-vogel', 'Victor Vogel', 10, 'mittelfeld', 'first-team'),
  ('willi-werner', 'Willi Werner', 11, 'mittelfeld', 'first-team'),
  ('anton-ackermann', 'Anton Ackermann', 23, 'mittelfeld', 'first-team'),
  ('bruno-berger', 'Bruno Berger', 29, 'mittelfeld', 'first-team'),
  ('carl-conrad', 'Carl Conrad', 31, 'mittelfeld', 'first-team'),
  ('emil-ebert', 'Emil Ebert', 37, 'mittelfeld', 'first-team'),
  ('felix-fischer', 'Felix Fischer', 7, 'sturm', 'first-team'),
  ('gustav-gross', 'Gustav Groß', 9, 'sturm', 'first-team'),
  ('hannah-horn', 'Hannah Horn', 19, 'sturm', 'first-team'),
  ('thijs-beispiel', 'Alex Beispiel', 27, 'sturm', 'loan-in'),
  ('iwan-klein', 'Iwan Klein', 30, 'sturm', 'first-team'),
  ('jule-kraft', 'Jule Kraft', 38, 'sturm', 'on-loan'),
  ('karl-lamb', 'Karl Lamb', null, 'sturm', 'first-team'),
  ('lena-mayer', 'Lena Mayer', null, 'abwehr', 'on-loan'),
  ('moritz-neumann', 'Moritz Neumann', null, 'sturm', 'on-loan'),
  ('nina-ott', 'Nina Ott', null, 'sturm', 'on-loan'),
  ('otto-pelz', 'Otto Pelz', null, 'abwehr', 'on-loan');

update public.players
set
  nationality = 'Deutschland',
  date_of_birth = '1995-04-25',
  joined_on = '2021-07-01',
  contract_until = '2027-06-30',
  height_cm = 190,
  preferred_foot = 'rechts',
  market_value_eur = 2500000,
  bio = 'Erfahrener Torhüter und wichtiger Rückhalt der Mannschaft.'
where slug = 'lukas-luecke';

insert into public.player_charts (
  player_id,
  title,
  description,
  metrics
)
select
  id,
  'Torwartprofil 2026/27',
  'Redaktionelle Einordnung zentraler Torwartqualitäten.',
  '[{"label":"Reflexe","value":86},{"label":"Strafraum","value":78},{"label":"Aufbau","value":81},{"label":"Eins gegen Eins","value":84},{"label":"Lange Bälle","value":76}]'::jsonb
from public.players
where slug = 'lukas-luecke';

insert into public.loans
  (player_id, direction, partner_club, starts_on, ends_on, status, note, source_url)
select id, 'incoming', 'FC Bologna', '2026-08-17', '2027-06-30', 'active',
  'Leihe für die Saison 2026/27',
  'https://example.com/aktuelles/news/fc-leiht-stuermer-thijs-beispiel-aus'
from public.players where slug = 'thijs-beispiel';

insert into public.loans
  (player_id, direction, partner_club, starts_on, ends_on, status, note, source_url)
select id, 'outgoing', 'Widzew Łódź', '2026-07-26', '2027-06-30', 'active',
  'Saisonleihe nach Polen',
  'https://example.com/en/news/all-news/oskar-ostermann-joins-widzew-lodz-on-loan'
from public.players where slug = 'oskar-ostermann';

insert into public.loans
  (player_id, direction, partner_club, starts_on, ends_on, status, note, source_url)
select id, 'outgoing', 'FC St. Pauli', '2026-08-27', '2027-06-30', 'active',
  'Saisonleihe in die 2. Bundesliga',
  'https://example.com/aktuelles/news/fc-verleiht-noah-nordmann-in-die-2-bundesliga'
from public.players where slug = 'noah-nordmann';

insert into public.loans
  (player_id, direction, partner_club, starts_on, ends_on, status, note, source_url)
select id, 'outgoing', 'Rot-Weiss Essen', '2026-07-01', '2027-06-30', 'active',
  'Saisonleihe in die 3. Liga',
  'https://example.com/aktuelles/news/so-starteten-die-leihspieler-in-die-neue-saison'
from public.players where slug = 'paul-peters';

insert into public.loans
  (player_id, direction, partner_club, starts_on, ends_on, status, note, source_url)
select id, 'outgoing', 'Roda JC Kerkrade', '2026-07-01', '2027-06-30', 'active',
  'Saisonleihe in die Niederlande',
  'https://example.com/aktuelles/news/so-starteten-die-leihspieler-in-die-neue-saison'
from public.players where slug = 'quirin-quast';

insert into public.loans
  (player_id, direction, partner_club, starts_on, ends_on, status, note, source_url)
select id, 'outgoing', 'TSV Havelse', '2026-07-01', '2027-06-30', 'active',
  'Saisonleihe in die 3. Liga',
  'https://example.com/aktuelles/news/so-starteten-die-leihspieler-in-die-neue-saison'
from public.players where slug = 'rene-richter';
