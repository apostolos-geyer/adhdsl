import { adhdsl } from "./runners/adhdsl";
import { lit } from "./runners/lit";
import { solid } from "./runners/solid";
import { vanilla } from "./runners/vanilla";
import type { Runner } from "./runner";

type Op =
  | { kind: "create"; n: number }
  | { kind: "partialUpdate" }
  | { kind: "swap" }
  | { kind: "select"; index: number }
  | { kind: "append"; n: number }
  | { kind: "clear" };

type Scenario = {
  name: string;
  /** Operations executed inside the timing window (the measurement). */
  measure: Op;
  /** Operations executed before the timing window (setup). */
  setup?: Op[];
};

const SCENARIOS: Scenario[] = [
  {
    name: "create 1k",
    measure: { kind: "create", n: 1000 },
  },
  {
    name: "create 10k",
    measure: { kind: "create", n: 10000 },
  },
  {
    name: "replace 1k",
    setup: [{ kind: "create", n: 1000 }],
    measure: { kind: "create", n: 1000 },
  },
  {
    name: "partial update (every 10th of 1k)",
    setup: [{ kind: "create", n: 1000 }],
    measure: { kind: "partialUpdate" },
  },
  {
    name: "select 1 of 1k",
    setup: [{ kind: "create", n: 1000 }],
    measure: { kind: "select", index: 500 },
  },
  {
    name: "swap rows (1k)",
    setup: [{ kind: "create", n: 1000 }],
    measure: { kind: "swap" },
  },
  {
    name: "partial update AFTER swap (correctness probe)",
    setup: [
      { kind: "create", n: 1000 },
      { kind: "swap" },
    ],
    measure: { kind: "partialUpdate" },
  },
  {
    name: "append 1k to 1k",
    setup: [{ kind: "create", n: 1000 }],
    measure: { kind: "append", n: 1000 },
  },
  {
    name: "clear 1k",
    setup: [{ kind: "create", n: 1000 }],
    measure: { kind: "clear" },
  },
];

const RUNNERS: Array<() => Runner> = [vanilla, adhdsl, lit, solid];

const runOp = (runner: Runner, op: Op): void => {
  switch (op.kind) {
    case "create":
      runner.create(op.n);
      break;
    case "partialUpdate":
      runner.partialUpdate();
      break;
    case "swap":
      runner.swap();
      break;
    case "select":
      runner.select(op.index);
      break;
    case "append":
      runner.append(op.n);
      break;
    case "clear":
      runner.clear();
      break;
  }
};

/**
 * Force layout/paint to settle by reading offsetHeight on the host. This
 * makes the measurement include the synchronous layout the framework would
 * otherwise defer, putting all runners on equal footing.
 */
const settle = (host: HTMLElement) => {
  void host.offsetHeight;
};

const median = (xs: number[]): number => {
  const s = xs.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const runScenario = async (
  factory: () => Runner,
  scenario: Scenario,
  iterations: number,
  host: HTMLElement,
): Promise<number> => {
  const samples: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const runner = factory();
    runner.mount(host);
    if (scenario.setup) {
      for (const op of scenario.setup) runOp(runner, op);
      settle(host);
    }
    const start = performance.now();
    runOp(runner, scenario.measure);
    settle(host);
    const elapsed = performance.now() - start;
    samples.push(elapsed);
    runner.unmount();
    // Yield to the event loop between iterations so GC has a chance.
    await new Promise((r) => setTimeout(r, 0));
  }
  return median(samples);
};

const runAll = async (
  iterations: number,
  onProgress: (msg: string) => void,
  host: HTMLElement,
): Promise<Record<string, Record<string, number>>> => {
  const results: Record<string, Record<string, number>> = {};
  for (const factory of RUNNERS) {
    const name = factory().name;
    results[name] = {};
    for (const scenario of SCENARIOS) {
      onProgress(`${name}: ${scenario.name}`);
      const ms = await runScenario(factory, scenario, iterations, host);
      results[name][scenario.name] = ms;
    }
  }
  onProgress("done");
  return results;
};

const formatResults = (
  results: Record<string, Record<string, number>>,
): string => {
  const frameworks = Object.keys(results);
  const scenarios = SCENARIOS.map((s) => s.name);
  const baseline = "vanilla";

  let html = "<table><thead><tr><th>scenario</th>";
  for (const f of frameworks) html += `<th>${f}</th>`;
  html += "</tr></thead><tbody>";

  for (const s of scenarios) {
    html += `<tr><td>${s}</td>`;
    const baselineMs = results[baseline]?.[s] ?? 0;
    for (const f of frameworks) {
      const ms = results[f][s];
      const ratio = baselineMs > 0 ? ms / baselineMs : 0;
      const cls = f === baseline ? "" : ratio < 1.5 ? "good" : ratio < 3 ? "ok" : "bad";
      html += `<td class="${cls}">${ms.toFixed(2)} ms${f !== baseline ? ` <span class="ratio">(${ratio.toFixed(2)}×)</span>` : ""}</td>`;
    }
    html += "</tr>";
  }
  html += "</tbody></table>";
  return html;
};

const $ = (id: string) => document.getElementById(id)!;

const runBtn = $("run") as HTMLButtonElement;
const iterInput = $("iterations") as HTMLInputElement;
const status = $("status");
const results = $("results");
const host = $("host") as HTMLElement;

runBtn.addEventListener("click", async () => {
  runBtn.disabled = true;
  results.innerHTML = "";
  const iterations = Math.max(1, parseInt(iterInput.value, 10) || 5);
  try {
    const data = await runAll(
      iterations,
      (msg) => (status.textContent = msg),
      host,
    );
    results.innerHTML = formatResults(data);
  } catch (err) {
    status.textContent = `error: ${err}`;
    console.error(err);
  } finally {
    runBtn.disabled = false;
  }
});
