import * as Sentry from '@sentry/browser';
import {
  readDataSaverPreference,
  resolveDataSaverActive,
  systemDataSaverRequested,
} from './lib/data-saver';

// Client-Eintrag fuer die Sentry-Astro-Integration. Die DSN kommt aus
// PUBLIC_SENTRY_DSN; ohne Wert initialisiert das SDK wirkungslos.
// Im Datensparmodus (eigene Einstellung oder Systemeinstellung des Browsers)
// wird Tracking nicht initialisiert.
if (
  !resolveDataSaverActive(readDataSaverPreference(), systemDataSaverRequested())
) {
  Sentry.init({
    dsn: import.meta.env.PUBLIC_SENTRY_DSN,
  });
}
