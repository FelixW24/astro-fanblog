# Übersicht — Astro Fanblog

Astro Fanblog ist eine quelloffene, **neutrale** Fanblog-Software für
Fußball-Communities: redaktionelles Blog, Spielplan, Kader, Leihspieler und ein
Community-Bereich — ohne Vereinsfarben, dafür mit ruhiger Indigo-Palette
(inspiriert von [nipponcolors.com](https://nipponcolors.com)).

## Das Wichtigste in Kürze

- **Öffentliche Seite:** News, Spielberichte, Kader, Leihspieler, Spielplan, Kommentare & Bewertungen
- **Admin-Bereich (`/admin`):** Artikel, Spieler, Spieltage, Moderation, Newsletter, Sicherheit
- **Technik:** Astro 7 + TypeScript (strict), Panda CSS mit Design-Tokens, Supabase (PostgreSQL, Auth, Row-Level Security)
- **Sprache:** UI auf Deutsch, Code und README auf Englisch
- **Farben:** neutrale Palette aus traditionellen japanischen Farben — Tokens in `src/styles/tokens.css`, Doku in `design.md`

## Projekt-Aufbau

```
src/pages/       Routen: öffentliche Seiten, /admin, /api
src/components/  wiederverwendbare UI-Komponenten (PascalCase)
src/layouts/     Seiten-Layouts
src/lib/         Logik, Datenzugriff, Mail-Templates (+ Unit-Tests)
src/styles/      globale CSS-Dateien und Design-Tokens (tokens.css)
public/          statische Assets (Logos in public/logo/, Bilder, Hintergründe)
supabase/        Datenbank-Migrationen und Seed-Daten
e2e/             Playwright-End-to-End-Tests
scripts/         Automatisierung (Setup, Prüfungen)
```

Generierte Verzeichnisse (`dist/`, `.astro/`, `styled-system/`, `coverage/`) nicht bearbeiten.

## Loslegen

Voraussetzungen: Node.js ≥ 22.23.4, Docker, Git. Die ausführliche Anleitung mit
allen Befehlen steht im [README](../README.md):

```sh
git clone https://github.com/FelixW24/astro-fanblog.git
cd astro-fanblog
npm ci
cp .env.example .env.local   # eigene Werte eintragen
npm run dev                  # http://localhost:4321
```

Zum Mitentwickeln: Branch von `opensource` anlegen, Änderungen committen, Pull
Request stellen — Details in [AGENTS.md](../AGENTS.md).

## Konfiguration & Secrets

In diesem Repository liegen **keine Secrets**. Alle Zugangsdaten (Supabase,
SMTP, Signier-Schlüssel) gehören ausschließlich in die lokale Datei
`.env.local`, die von Git ignoriert wird. Die kommentierte Übersicht aller
Variablen steht in [`.env.example`](../.env.example) — niemals Schlüssel,
Passwörter oder Tokens committen.

## Weitere Dokumentation

- [README](../README.md) — ausführlich: Quick Start, Befehle, Tests, Deployment
- [design.md](../design.md) — Design-System, Farb-Tokens, Themes
- [AGENTS.md](../AGENTS.md) — Richtlinien für Mitwirkende (Struktur, Stil, Tests)
- [LICENSE](../LICENSE) — MIT-Lizenz
