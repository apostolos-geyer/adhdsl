# adhdsl

apostoli's dumb hypertext domain specific language

just another frontend reactivity library, because i think there wasnt enough of them yet
arose by accident because my class made me do a vanilla html/js assignment and i didnt like imperatively creating reactivity.. it looked visually yucky.

external libs weren't available, and what i ended up making was close enough to roll my own little reactivity and signals library.

## what it does

- tagged-template `html` with per-call-site template caching (parse once, clone after)
- signals (`subject`) with batching, equality short-circuit, multi-source derivations
- keyed list reconciliation (`each`) with LIS-based diff
- declarative event handlers (`on`) and reactive attributes (`subjective`)
- automatic subscription + listener teardown when elements leave the dom

no jsx, no build step, no extra deps.

## install

with bun:
```bash
bun install apostolos-geyer/adhdsl
```

with node:
```bash
npm install apostolos-geyer/adhdsl
```

deno users i have no clue. good luck.

## hello counter

```ts
import html, { subject, using, on, subjective } from "adhdsl";

const counter = subject(0);
const colour = subject<"blue" | "red">("blue");

const view = html`
  <div>
    <h1>stupid counter</h1>
    <button
      ${subjective({
        style: using(colour, c => `color:white;background-color:${c};padding:10px`),
      })}
      ${on({ click: () => counter.set(n => n + 1) })}
    >
      clicked ${using(counter, n => `${n} times`)}
    </button>
    <button ${on({ click: () => colour.set(c => c === "red" ? "blue" : "red") })}>
      change colour
    </button>
  </div>
`;

document.body.appendChild(view);
```

## api

### `subject(value, opts?)`

reactive state. has a current value, can be set, can be subscribed to.

```ts
const name = subject("world");
name.value;             // "world"
name.set("there");      // notify observers
name.set(s => s + "!"); // updater form

// custom equality (default is Object.is)
const items = subject<Item[]>([], { equals: (a, b) => a.length === b.length });
```

setting to a value `equals`-equal to the current one is a no-op.

### `using(source, fn)` — derivations

derive a value from one or more subjects.

```ts
const greeting = using(name, n => `hello ${n}`);
const fullName = using([first, last], (f, l) => `${f} ${l}`);
```

interpolate `using(...)` results into templates anywhere a subject would go (text content, `subjective` attribute values).

derivations memoize per-attachment — if the recompute returns the same value as before, no DOM write happens. so a "selected row id" derivation attached to 1000 rows produces ~2 DOM writes per selection change instead of 1000.

### `each(items, keyFn, renderFn)` — keyed lists

reconcile a list against the dom by key. surviving items keep their nodes across updates; only nodes outside the longest-increasing-subsequence of new positions actually move.

```ts
import { each } from "adhdsl";

const todos = subject<Todo[]>([]);

const list = html`
  <ul>
    ${each(todos, t => t.id, t => html`<li>${t.text}</li>`)}
  </ul>
`;

todos.set([...todos.value, { id: 3, text: "ship it" }]); // appends one li
```

prefer `each` over `using(items, items => items.map(render))` for any list — the `using` form rebuilds every node on every change.

### `batch(fn)` — coalesce notifications

multiple `.set()` calls inside a batch fire each affected subject's observers exactly once at the end.

```ts
import { batch } from "adhdsl";

batch(() => {
  firstName.set("ada");
  lastName.set("lovelace");
  age.set(36);
});
```

### `on({ event: handler, ... })` — listeners

declarative event handlers in attribute position.

```ts
html`<button ${on({ click: e => console.log(e), mouseenter: () => ... })}>x</button>`;
```

handlers are removed automatically when the element leaves the dom.

### `subjective({ attr: subject, ... })` — reactive attributes

bind attributes to subjects or derivations.

```ts
html`
  <button
    ${subjective({
      class: using(isValid, ok => ok ? "ok" : "err"),
      disabled: isLoading,
      title: hint,
    })}
  >
    submit
  </button>
`;
```

values update reactively. subscriptions tear down when the element leaves the dom.

how values map to attributes:
- `true` → attribute present with empty value (`disabled=""`). this is the right thing for boolean attributes — `disabled="false"` would still disable the element.
- `false`, `null`, `undefined` → attribute removed.
- anything else → `setAttribute(name, String(value))`.

caveat: `subjective` writes *attributes*, not *properties*. for `<input>` `value`, `<input type=checkbox>` `checked`, `<select>` `value`, etc., the attribute only sets the *initial* value — after the user interacts, the attribute and property diverge. write the property directly via a ref or a small effect; a `model` directive for two-way binding is on the todo list.

mid-attribute static interpolation works for primitives (`<a href="/u/${id}">`) but reactive mid-attribute interpolation doesn't — use `subjective` instead.

## how it works (in 4 bullets)

1. tagged-template strings are cached per call-site (`TemplateStringsArray` identity is stable). first call builds a placeholder html string, parses via `template.innerHTML`, walks the resulting fragment recording placeholder paths. subsequent calls clone the parsed fragment and apply values along the cached paths.
2. signals notify observers synchronously by default; inside `batch()`, notifications are deferred until the batch closes.
3. a lazy document-wide `MutationObserver` runs registered cleanup callbacks when nodes leave the dom (skipping nodes that are still connected, since `insertBefore` of an in-tree node fires a spurious removedNodes record).
4. `each` keeps a `Map<key, Node>` across renders, removes vanished keys, then walks new keys end-to-start and only moves nodes outside the LIS of "old position in new order."

## what's missing

- no SSR / hydration
- no SVG (the parser doesn't switch to SVG namespace inside `<svg>`)
- no web components / shadow DOM integration
- no router (write your own — `popstate` + a `route` subject is ~50 LOC)
- no lifecycle / `onMount` / `onCleanup` (subscriptions are tied to elements, but there's no per-component scope yet)
- no test suite. there are almost certainly bugs i haven't found.

## benchmarks

`bench/` runs js-framework-benchmark-style scenarios against vanilla DOM, adhdsl, lit-html, and solid-js.

```bash
cd bench
bun install
bun run dev
# open the printed url, click "run benchmarks"
```

short version (median ms, 1000 rows, headless chromium, ratios vs vanilla):

| scenario | adhdsl | lit-html | solid |
|---|---:|---:|---:|
| create 1k | 1.08× | 1.23× | 0.81× |
| partial update | 0.87× | 1.67× | 1.53× |
| swap rows | 1.57× | 2.86× | 1.43× |
| append 1k to 1k | 1.29× | 1.42× | 0.95× |
| clear 1k | 2.00× | 7.67× | 1.22× |

solid wins on raw render (compiler advantage). adhdsl wins on partial update (signals at the leaf skip the template machinery entirely). lit-html is bringing up the rear because the benchmark uses the canonical lit pattern of "rerender from the top and let the diff figure it out," which doesn't have a state primitive baked in. fair comparison would be lit-html + a signals integration.

## license

MIT, do whatever
