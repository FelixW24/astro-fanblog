# Astro Fanblog — Design-System

Astro Fanblog ist ein neutraler Fanblog. Eine helle Papierfläche, weiße
Karten, dunkle Schrift und ein indigofarbener Akzent prägen die öffentliche
Oberfläche. Die Akzentfarben sind traditionelle japanische Farben von
[nipponcolors.com](https://nipponcolors.com) — bewusst neutral und weg von
Vereinsfarben wie Rot-Weiß. Die Redaktion verwendet dieselben Farb- und
Schrift-Tokens, hat aber eigene Layouts in `src/styles/admin/`.

Dieses Dokument beschreibt den aktuellen Stand. `src/styles/tokens.css` ist
die Quelle für Farben, Schriftstapel, Abstände und benannte Radien.
`panda.config.ts` referenziert diese Variablen; Komponenten verwenden die Tokens
statt eigener Ersatzfarben. Wo Komponenten eine besondere Darstellung brauchen,
ist die Ausnahme unten beschrieben.

## Farben und Themes

| Rolle / CSS-Variable                  | Hell                    | Dunkel                   | Verwendung                       |
| ------------------------------------- | ----------------------- | ------------------------ | -------------------------------- |
| `--color-canvas`                      | `#f7f7f5`               | `#0e1012`                | Seitenhintergrund                |
| `--color-paper`                       | `#ffffff`               | `#171a1d`                | Karten und ruhige Flächen        |
| `--color-stone`                       | `rgb(98 103 107 / 22%)` | `rgb(168 173 178 / 18%)` | abgesetzte Flächen               |
| `--color-ink-black`, `--color-carbon` | `#151719`               | `#f4f4f2`                | Haupttext und Überschriften      |
| `--color-slate`, `--color-mint`       | `#62676b`               | `#a8adb2`                | Metadaten und Nebeninformation   |
| `--color-fog`                         | `#e2e3e4`               | `#292d31`                | Linien und Rahmen                |
| `--color-blueprint-blue`              | `#006284`               | `#2ea9df`                | Links, Aktionen, aktive Zustände |
| `--color-blueprint-blue-dark`         | `#113285`               | `#58b2dc`                | verstärkte Akzentzustände        |
| `--color-highlight`                   | `#a5dee4`               | `#566c73`                | Textauswahl (`::selection`)      |
| `--surface-interactive-hover`         | `#ededeb`               | `#121417`                | ruhige Hover-Fläche              |

`blueprintBlue` und `mint` sind historische Token-Namen: Sie stehen heute für
den Indigo-Akzent und gedämpftes Grau. Die Akzentwerte kommen von
[nipponcolors.com](https://nipponcolors.com): 縹 Hanada `#006284` (hell) bzw.
露草 Tsuyukusa `#2ea9df` (dunkel), dazu 紺青 Konjō `#113285` und 空 Sora
`#58b2dc` für verstärkte Zustände sowie 瓶覗 Kamenozoki `#a5dee4` und 藍鼠
Ainezumi `#566c73` für die Textauswahl. Neue Komponenten verwenden weiterhin
die bestehenden Tokens. Die Sidebar besitzt in
`src/styles/public/base.css` eigene helle und dunkle Variablen für Kontrast und
Navigation; sie ist keine zweite globale Palette.

Ohne gespeicherte Auswahl startet die Seite im Dunkelmodus, unabhängig von der
Systempräferenz. Eine gespeicherte Auswahl hat Vorrang. Gespeichert werden die
Werte `light`, `dark` und `system` (im Profil-Modal wählbar); `system` folgt der
Systemeinstellung über `prefers-color-scheme`. Der schnelle Theme-Schalter
wechselt nur Hell/Dunkel und setzt `data-theme="light"` beziehungsweise
`data-theme="dark"` auf dem Wurzelelement. Neue Oberflächen müssen in beiden
Modi lesbar sein.

Hinter dem Inhalt liegt das fixe Stadionbild `--stadium-background` (helle und
dunkle SVG-Variante), das nach unten ausblendet. Auf der Startseite bekommen
die großen Panels (Start-Hero und Karussell der neuesten Beiträge) eine
Glasfläche: `--surface-glass` (halbtransparentes Papier), `--glass-border`
(haarfeiner Rand) und `--glass-blur` (`backdrop-filter`). Normale Karten
bleiben opak; Glasflächen sind den großen Containerflächen vorbehalten, damit
Lesbarkeit und Scroll-Performance erhalten bleiben. Ohne
`backdrop-filter`-Unterstützung fallen die Panels auf opakes Papier zurück.

## Schrift und Icons

`--font-ranade` ist der globale Schriftstapel für Text und Bedienelemente.
**Ranade** wird über die Fontshare-API geladen; die bereits eingebundene
**Inter Variable** bleibt als lokaler Fallback erhalten. Die historischen Tokens
`--font-suisseintl`, `--font-suisse-intl` und `--font-suisse-mono` zeigen
weiterhin auf `--font-ranade`, damit bestehende Komponenten ohne abweichende
Schrift weiter funktionieren.

Der Fließtext hat 16px bei 1,5 Zeilenhöhe. Die Basis-Skala enthält 12px
(`caption`), 14px (`body-sm`), 16px (`body`), 18px (`subheading`), 20px
(`heading-sm`) und 30px (`heading`). Große Seitenüberschriften skalieren in
`src/styles/public/page-headings.css` responsiv von 30px bis 64px. Kleinere
Navigations- und Metadatenbeschriftungen sowie einzelne große Zahlen sind
bewusste komponentenspezifische Ausnahmen. Auf Seitenüberschriften markiert
ein indigofarbener Schlusspunkt die redaktionelle Handschrift.

Die Schriftmerkmale `calt`, `kern`, `liga` und `ss01` sind am Body aktiv.
Icons kommen aus `src/components/Icon.astro` als SVGs. Die meisten sind
umrissen; einzelne sind gefüllt. Sie übernehmen `currentColor`, damit Text
und Icon denselben Zustand anzeigen. Flaggen nutzen `flag-icons`.

## Abstände, Formen und Fokus

Die Abstandsbasis beträgt 4px. Die verfügbaren Tokens sind 4, 8, 12, 16,
20, 28, 32, 48 und 64px. `--section-gap` ist 36px, `--card-padding` 14px und
`--element-gap` 8px. Die gemeinsame `.shell` ist höchstens 1100px breit und
hat insgesamt 32px Abstand zum Viewport-Rand, soweit der Viewport dies
zulässt. `panda.config.ts` und `src/styles/public/base.css` verwenden dieselbe
Definition.

| Element                   | Token                               | Wert |
| ------------------------- | ----------------------------------- | ---- |
| Tags und Standard-Buttons | `--radius-tags`, `--radius-buttons` | 10px |
| Eingaben                  | `--radius-inputs`                   | 10px |
| Karten                    | `--radius-cards`                    | 12px |
| größere Panels            | `--radius-heropanel`                | 16px |

Diese Radien sind Standards, keine Beschränkung auf vier Werte. Kleine
Navigations- und Suchfelder verwenden teils 5–9px. Profilbilder, Statuspunkte,
Charts und ausgewählte Labels dürfen rund sein. Karten nutzen meist feine
Rahmen; Schlagschatten sind für schwebende oder besonders hervorgehobene
Elemente wie Rubrikkarten und Spielerkarten vorgesehen. Die Tokens
`--shadow-floating`, `--shadow-category` und `--shadow-category-hover` bilden
diese Ausnahmen ab. Leichte Verläufe sind für Bildmasken, Hintergrundbilder
und einzelne Flächen erlaubt.

Tastaturfokus muss sichtbar sein. Formulare, Links und Bedienelemente nutzen
eine kontrastierende Kontur; ein ruhiger Hover-Zustand ersetzt den Fokus nicht.
Eingaben und Suchfelder können zusätzlich ihre Rahmenfarbe ändern.

## Layout und Komponenten

Die öffentliche Seite hat links eine 208px breite, einklappbare Sidebar. Im
eingeklappten Zustand ist sie 64px breit. Rechts liegen eine schmale Topbar
mit Suche, Theme-Schalter und Leserkonto sowie der Seiteninhalt. Auf kleineren
Viewports wird die Navigation angepasst. Die Startseite beginnt mit einer
Textüberschrift, zeigt die neuesten Beiträge als Karussell, danach fünf
Rubriken und einen Kaderbereich. Ein Hero-Panel mit Illustration ist kein
verbindlicher Startseitenbaustein.

Der Profilbereich ist kein eigener Seitenaufruf, sondern ein Modal: Eingeloggte
Leser öffnen es über den Sidebar-Eintrag „Mein Profil“ oder das Kontomenü der
Topbar. Der Inhalt wird als Fragment von `/profil` nachgeladen; direkte
Besuche von `/profil` leiten zur Startseite weiter. Die Einstellungen sind in
fünf Gruppen gegliedert (Profil, Sicherheit, Darstellung, Benachrichtigungen,
Konto) und liegen auf breiten Viewports in einer Navigationsspalte im Modal,
auf schmalen Viewports in einer kompakt horizontal scrollbaren
Navigationsleiste. Bislang nicht verfügbare Bereiche wie Social Links,
Sitzungen und Benachrichtigungen sind als klar gekennzeichnete Platzhalter
sichtbar. Die Kontolöschung läuft als `fetch`-Post gegen
`/api/profil/konto-loeschen` und zeigt Fehler direkt im Modal. Stylesheet:
`src/styles/public/profile-settings.css`.

Die öffentlichen Seitenköpfe (`.page-hero`) bilden eigene, deckende Panels
auf Basis von `--color-canvas`, mit feinem Rahmen und `--radius-heropanel`.
Das Stadionbild bleibt außerhalb dieser Panels sichtbar. Beitragsübersicht,
Rubriken, Kader, Leihspieler und Rechtstexte verwenden dieselbe Fläche in
beiden Farbmodi und auf mobilen Viewports. Der Begrüßungstext auf der
Startseite (`.page-hero--home`) steht ohne Fläche und Rahmen direkt über
dem Stadionbild.

Artikelkarten (`src/components/ArticleCard.astro`) zeigen links ein
quadratisches Bild beziehungsweise eine Kategorie-Grafik und rechts Kategorie,
Datum, Titel, Auszug, Autor und Lesezeit. Die Standardkarte verwendet ein
140px breites Bildfeld und 12px Radius; hervorgehobene Karten haben ein
größeres Bildfeld. Der Bildbeschnitt und die Anordnung passen sich auf
schmalen Viewports an. Stimmen und Kommentare stehen auf der Artikelseite,
nicht auf den Karten der Startseite.

Der Indigo-Akzent kennzeichnet Links, wichtige Aktionen und aktive Zustände.
Gefüllte Akzent-Aktionen dürfen innerhalb eines klaren Handlungsbereichs
auftreten; die Zahl pro Viewport ist keine feste Regel. Kategorien, Badges und
Metadaten bleiben zurückhaltend. Text, Rahmen und Flächen verwenden die
jeweiligen Theme-Tokens. Die Sidebar hat eigene Farben, um Navigation und
Kontrast in beiden Themes zu erhalten.

## Umsetzung

- Token-Werte ändern: `src/styles/tokens.css`.
- Panda-Zuordnung ändern: `panda.config.ts`.
- Öffentliche Komponenten und Responsivität ändern: `src/styles/public/` und
  `src/components/`.
- Redaktion ändern: `src/styles/admin/` und `src/layouts/AdminLayout.astro`.
- Theme-Verhalten ändern: `src/components/ThemeInit.astro` und
  `src/components/ThemeToggle.astro`.

Bei neuen Komponenten zuerst bestehende Tokens und Zustände prüfen. Sichtbare
Fokusmarkierungen, Hell- und Dunkelmodus und schmale Viewports gehören zur
Abnahme.
