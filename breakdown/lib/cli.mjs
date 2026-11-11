// Command-line plumbing shared by prep, render and excerpt.
import { parseArgs } from "node:util";

/** Reads `argv` against a command's string options. An unknown option or one without its value is an error. */
export function readArgs(argv, names) {
  const options = Object.fromEntries(names.map((n) => [n, { type: "string" }]));
  const { values, positionals } = parseArgs({ args: argv, options, allowPositionals: true, strict: true });
  return { values, positionals };
}

/** Runs a command's main; a failure prints its message (the stack too with DEBUG=1) and exits 1. */
export function runCli(main) {
  main().catch((e) => {
    console.error(`error: ${e.message}`);
    if (process.env.DEBUG) console.error(e.stack);
    process.exit(1);
  });
}
