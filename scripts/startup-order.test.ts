import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { expect, it } from "vitest";

for (const target of ["tmux", "dev"]) {
  for (const fail of ["none", "supabase:start", "admin:check"]) {
    it(`${target}: application ${fail === "none" ? "starts after migrations and account check" : `does not start after ${fail} failure`}`, () => {
      const directory = mkdtempSync(join(tmpdir(), "astro-fanblog-startup-"));
      try {
        const log = join(directory, "commands");
        writeFileSync(
          join(directory, "npm"),
          `#!/bin/sh
echo "npm $*" >> "$COMMAND_LOG"
if [ "$2" = "$START_FAIL" ]; then exit 7; fi
`,
          { mode: 0o700 },
        );
        writeFileSync(
          join(directory, "node"),
          `#!/bin/sh
echo "node $*" >> "$COMMAND_LOG"
`,
          { mode: 0o700 },
        );
        const recipe = execFileSync("make", ["-n", target], {
          encoding: "utf8",
        });
        const command = recipe.match(/tmux new-session[^\n]* '([^']+)'/u)?.[1];
        expect(command).toBeDefined();
        const result = spawnSync("/bin/sh", ["-c", command!], {
          cwd: directory,
          encoding: "utf8",
          input: "\n",
          env: {
            ...process.env,
            PATH: directory + ":" + process.env.PATH,
            COMMAND_LOG: log,
            START_FAIL: fail,
          },
        });
        expect(result.status).toBe(fail === "none" ? 0 : 7);
        const commands = readFileSync(log, "utf8").trim().split("\n");
        expect(commands).toEqual(
          fail === "supabase:start"
            ? ["npm run supabase:start"]
            : [
                "npm run supabase:start",
                "node scripts/wait-for-supabase.mjs 120",
                target === "tmux"
                  ? "npm run admin:check -- --production"
                  : "npm run admin:check",
                ...(fail === "admin:check"
                  ? []
                  : target === "tmux"
                  ? ["npm run build", "npm run preview"]
                  : ["npm run dev"]),
              ],
        );
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    });
  }
}
