#!/usr/bin/env node
import { readFileSync, existsSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { Command } from "commander";
import {
  DepthModeSchema,
  GuardrailExceptionsFileSchema,
  GuardrailRuleSetFileSchema,
  type GuardrailException,
} from "@krama/shared";
import { formatReport, runCheck } from "./engine.js";

/** Exit codes: 0 = passed, 1 = blocking failures, 2 = configuration / usage error. */
const program = new Command()
  .name("krama-guardrails")
  .description("Server-side Krama guardrail checker (run as a required GitHub status check)");

program
  .command("check")
  .argument("<path>", "repository root to scan")
  .requiredOption("--rules <file>", "guardrails.json")
  .option("--exceptions <file>", "exceptions.json (approved exceptions are honoured)")
  .option("--mode <mode>", "skeleton | guided | governed", "guided")
  .option("--change-ref <ref>", "branch/PR ref; enables change-scoped exceptions")
  .option("--format <format>", "text | json", "text")
  .action((path: string, o: { rules: string; exceptions?: string; mode: string; changeRef?: string; format: string }) => {
    try {
      const mode = DepthModeSchema.parse(o.mode);
      const ruleSet = GuardrailRuleSetFileSchema.parse(JSON.parse(readFileSync(o.rules, "utf8")));
      let exceptions: GuardrailException[] = [];
      if (o.exceptions && existsSync(o.exceptions)) {
        exceptions = GuardrailExceptionsFileSchema.parse(JSON.parse(readFileSync(o.exceptions, "utf8"))).exceptions;
      }
      const report = runCheck({ root: resolve(path), ruleSet, exceptions, mode, changeRef: o.changeRef });
      const text = formatReport(report);
      console.log(o.format === "json" ? JSON.stringify(report, null, 2) : text);
      if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, "```\n" + text + "\n```\n");
      process.exitCode = report.passed ? 0 : 1;
    } catch (err) {
      console.error(`krama-guardrails: ${err instanceof Error ? err.message : String(err)}`);
      process.exitCode = 2;
    }
  });

program.parse();
