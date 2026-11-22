// Command-line plumbing shared by prep, render and excerpt.
import { parseArgs } from "node:util";

/** Reads `argv` against a command's string options and on/off flags. An unknown option or one without its value is an error. */
export function readArgs(argv, names, flags = []) {
  const options = Object.fromEntries([...names.map((n) => [n, { type: "string" }]), ...flags.map((n) => [n, { type: "boolean" }])]);
  // a negative number is a value, not a flag: "--lufs -14" reads as --lufs=-14
  const args = [];
  for (let i = 0; i < argv.length; i++) {
    if (options[argv[i].slice(2)]?.type === "string" && argv[i].startsWith("--") && /^-\d/.test(argv[i + 1] ?? "")) args.push(`${argv[i]}=${argv[++i]}`);
    else args.push(argv[i]);
  }
  const { values, positionals } = parseArgs({ args, options, allowPositionals: true, strict: true });
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
