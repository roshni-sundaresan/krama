#!/usr/bin/env node
import { Command } from "commander";
import { DepthModeSchema } from "@krama/shared";
import { loadConfig, saveConfig } from "./config.js";
import { evaluateChecklist, formatCheck, loadChecklist } from "./commands/check.js";
import { pull } from "./commands/pull.js";
import { executeRun, planRun } from "./commands/run.js";
import { push } from "./commands/push.js";

const fail = (err: unknown): void => {
  console.error(`krama: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
};

const program = new Command().name("krama").description("Krama developer CLI").version("0.1.0");

program
  .command("login")
  .description("Store Krama server URL and API token")
  .requiredOption("--server <url>", "Krama server base URL, e.g. https://krama.idealake.local")
  .requiredOption("--token <token>", "API token (from the Build tab in the Krama web app)")
  .action((o: { server: string; token: string }) => {
    const p = saveConfig({ server: o.server, token: o.token });
    console.log(`Saved credentials to ${p}`);
  });

program
  .command("check")
  .description("Check required software from the context pack (or a blueprint file)")
  .option("--blueprint <file>", "local blueprint/checklist JSON")
  .option("--mode <mode>", "override depth mode: skeleton | guided | governed")
  .action((o: { blueprint?: string; mode?: string }) => {
    try {
      const { checklist, source } = loadChecklist(process.cwd(), o.blueprint);
      const outcome = evaluateChecklist(checklist, { mode: o.mode ? DepthModeSchema.parse(o.mode) : undefined });
      console.log(formatCheck(outcome, source));
      if (outcome.blocked) process.exitCode = 1;
    } catch (e) {
      fail(e);
    }
  });

program
  .command("pull")
  .description("Download the approved context pack into .krama/")
  .argument("<projectId>")
  .action(async (projectId: string) => {
    try {
      const files = await pull(loadConfig(), projectId, process.cwd());
      console.log(`Context pack written:\n  ${files.join("\n  ")}`);
    } catch (e) {
      fail(e);
    }
  });

program
  .command("run")
  .description("Run an approved, locally installed coding tool against the context pack")
  .requiredOption("--tool <tool>", "claude | copilot | codex")
  .option("--dry-run", "print the command without running it")
  .action((o: { tool: string; dryRun?: boolean }) => {
    try {
      const plan = planRun(process.cwd(), o.tool);
      const printable = [plan.command, ...plan.args.map((a) => JSON.stringify(a))].join(" ");
      if (o.dryRun) {
        console.log(`[dry-run] ${printable}`);
        return;
      }
      console.log(`Running ${plan.tool}…`);
      process.exitCode = executeRun(plan, process.cwd());
    } catch (e) {
      fail(e);
    }
  });

program
  .command("push")
  .description("Commit to a new krama-gen-<timestamp> branch and push it")
  .option("-m, --message <msg>", "commit message")
  .option("--remote <name>", "git remote", "origin")
  .option("--dry-run", "print git commands only")
  .action((o: { message?: string; remote: string; dryRun?: boolean }) => {
    try {
      const branch = push({ cwd: process.cwd(), message: o.message, remote: o.remote, dryRun: o.dryRun });
      console.log(`\nPushed ${branch}. Open a pull request: the server-side "krama-guardrails" required check will run on it.`);
    } catch (e) {
      fail(e);
    }
  });

await program.parseAsync();
