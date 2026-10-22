// Run from the project root: node tests/realtimeChannel.test.mjs
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import fs from "node:fs";
const out = "tests/.rt.bundle.mjs";
await build({ entryPoints: ["src/components/shared/realtimeChannel.ts"], bundle: true, format: "esm", outfile: out, logLevel: "silent" });
const { uniqueChannelName } = await import(pathToFileURL(out).href + "?" + Date.now());
fs.rmSync(out);
let pass = 0, fail = 0;
const t = (n, c) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}`); };

// Fake of supabase.channel(): same name returns the same channel, and .on() after subscribe() throws.
const open = new Map();
const channel = (name) => {
  if (!open.has(name)) open.set(name, { subscribed: false });
  const ch = open.get(name);
  ch.on = () => { if (ch.subscribed) throw new Error(`cannot add postgres_changes callbacks for realtime:${name} after subscribe()`); return ch; };
  ch.subscribe = () => { ch.subscribed = true; return ch; };
  return ch;
};
const subscribe = (name) => channel(name).on().subscribe();

let threw = false;
try { subscribe("pickup-journeys-helper-a"); subscribe("pickup-journeys-helper-a"); } catch { threw = true; }
t("fixed names reproduce the crash on a remount", threw);

open.clear();
threw = false;
try { subscribe(uniqueChannelName("pickup-journeys-helper-a")); subscribe(uniqueChannelName("pickup-journeys-helper-a")); } catch { threw = true; }
t("unique names survive a remount before the old channel closed", !threw);
const names = new Set(Array.from({ length: 500 }, () => uniqueChannelName("x")));
t("500 names are all different", names.size === 500);
t("keeps the readable prefix", uniqueChannelName("backup-requests-k").startsWith("backup-requests-k:"));
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
