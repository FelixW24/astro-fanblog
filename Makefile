TMUX_SESSION ?= astro-fanblog
TMUX_DEV_SESSION ?= astro-fanblog-dev
TMUX_TEST_SESSION ?= astro-fanblog-tests
SUPABASE_READY_TIMEOUT ?= 120

.PHONY: tmux dev test test-essential test-tmux

tmux:
	@command -v tmux >/dev/null 2>&1 || { echo "Fehler: tmux ist nicht installiert." >&2; exit 1; }
	@if tmux has-session -t "$(TMUX_SESSION)" 2>/dev/null; then \
		if [ -n "$$TMUX" ]; then tmux switch-client -t "$(TMUX_SESSION)"; else tmux attach-session -t "$(TMUX_SESSION)"; fi; \
	else \
		tmux new-session -d -s "$(TMUX_SESSION)" -n app -c "$(CURDIR)" 'npm run supabase:start && node scripts/wait-for-supabase.mjs $(SUPABASE_READY_TIMEOUT) && npm run admin:check -- --production && npm run build && npm run preview; status=$$?; printf "\nStart beendet (Exit-Code %s). Enter zum Schließen.\n" "$$status"; read _; exit "$$status"'; \
		tmux select-pane -t "$(TMUX_SESSION):app.0"; \
		if [ -n "$$TMUX" ]; then tmux switch-client -t "$(TMUX_SESSION)"; else tmux attach-session -t "$(TMUX_SESSION)"; fi; \
	fi

dev:
	@command -v tmux >/dev/null 2>&1 || { echo "Fehler: tmux ist nicht installiert." >&2; exit 1; }
	@if tmux has-session -t "$(TMUX_DEV_SESSION)" 2>/dev/null; then \
		if [ -n "$$TMUX" ]; then tmux switch-client -t "$(TMUX_DEV_SESSION)"; else tmux attach-session -t "$(TMUX_DEV_SESSION)"; fi; \
	else \
		tmux new-session -d -s "$(TMUX_DEV_SESSION)" -n dev -c "$(CURDIR)" 'npm run supabase:start && node scripts/wait-for-supabase.mjs $(SUPABASE_READY_TIMEOUT) && npm run admin:check && npm run dev; status=$$?; printf "\nStart beendet (Exit-Code %s). Enter zum Schließen.\n" "$$status"; read _; exit "$$status"'; \
		tmux select-pane -t "$(TMUX_DEV_SESSION):dev.0"; \
		if [ -n "$$TMUX" ]; then tmux switch-client -t "$(TMUX_DEV_SESSION)"; else tmux attach-session -t "$(TMUX_DEV_SESSION)"; fi; \
	fi

test:
	@set -e; \
	printf '\n[Build]\n'; npm run build; \
	printf '\n[ESLint]\n'; npm run lint; \
	printf '\n[Astro-Check]\n'; npm run check; \
	printf '\n[Vitest]\n'; npm test; \
	printf '\n[Datenbank-RLS]\n'; npm run supabase:db:test; \
	printf '\n[Playwright]\n'; npm run test:auth -- e2e; \
	printf '\n[Reader UI]\n'; npx --no-install playwright test --config e2e/reader-profile.config.ts

# Schlanker CI-Modus: Kernfluesse statt aller Browser-Suiten. Die Auswahl
# deckt Anmeldung, Redaktion, Leserkonto, Kader und Sicherheitsmerkmale ab;
# rein visuelle und additive Layout-Suiten laeuft weiterhin `make test`.
ESSENTIAL_E2E_SPECS = \
	e2e/admin-login.spec.ts \
	e2e/auth-security.spec.ts \
	e2e/readers.spec.ts \
	e2e/admin-wizard.spec.ts \
	e2e/article-lifecycle.spec.ts \
	e2e/player-profile-create.spec.ts \
	e2e/security-headers.spec.ts \
	e2e/proxy-origin.spec.ts

test-essential:
	@set -e; \
	printf '\n[Build]\n'; npm run build; \
	printf '\n[ESLint]\n'; npm run lint; \
	printf '\n[Astro-Check]\n'; npm run check; \
	printf '\n[Vitest]\n'; npm test; \
	printf '\n[Datenbank-RLS]\n'; npm run supabase:db:test; \
	printf '\n[Playwright Kernsuite]\n'; npm run test:auth -- $(ESSENTIAL_E2E_SPECS)

test-tmux:
	@command -v tmux >/dev/null 2>&1 || { echo "Fehler: tmux ist nicht installiert." >&2; exit 1; }
	@if tmux has-session -t "$(TMUX_TEST_SESSION)" 2>/dev/null; then tmux kill-session -t "$(TMUX_TEST_SESSION)"; fi
	@tmux new-session -d -s "$(TMUX_TEST_SESSION)" -n tests -c "$(CURDIR)" 'npm run build; status=$$?; printf "\n[Build] Exit-Code: %s · Enter zum Schließen.\n" "$$status"; read _; exit "$$status"'
	@tmux split-window -h -t "$(TMUX_TEST_SESSION):tests" -c "$(CURDIR)" 'npm run lint; status=$$?; printf "\n[ESLint] Exit-Code: %s · Enter zum Schließen.\n" "$$status"; read _; exit "$$status"'
	@tmux split-window -v -t "$(TMUX_TEST_SESSION):tests.0" -c "$(CURDIR)" 'npm run check; status=$$?; printf "\n[Astro-Check] Exit-Code: %s · Enter zum Schließen.\n" "$$status"; read _; exit "$$status"'
	@tmux split-window -v -t "$(TMUX_TEST_SESSION):tests.1" -c "$(CURDIR)" 'npm test; status=$$?; printf "\n[Vitest] Exit-Code: %s · Enter zum Schließen.\n" "$$status"; read _; exit "$$status"'
	@tmux split-window -v -t "$(TMUX_TEST_SESSION):tests.2" -c "$(CURDIR)" 'npm run test:auth -- e2e; status=$$?; printf "\n[Playwright] Exit-Code: %s · Enter zum Schließen.\n" "$$status"; read _; exit "$$status"'
	@tmux select-layout -t "$(TMUX_TEST_SESSION):tests" tiled
	@tmux select-pane -t "$(TMUX_TEST_SESSION):tests.0"
	@if [ -n "$$TMUX" ]; then tmux switch-client -t "$(TMUX_TEST_SESSION)"; else tmux attach-session -t "$(TMUX_TEST_SESSION)"; fi
