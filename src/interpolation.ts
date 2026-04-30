import {
  unsubscribeOnElementRemoved,
  type Subject,
  isSubject,
} from "./subject";

/**
 * Wraps one or more subjects with a transform. The transform receives the
 * current value of each subject (in order) and returns the projected value.
 */
export class Derived<R> {
  #subjects: readonly Subject<any>[];
  #callback: (...values: any[]) => R;

  constructor(
    subjects: Subject<any> | readonly Subject<any>[],
    callback: (...values: any[]) => R,
  ) {
    this.#subjects = Array.isArray(subjects) ? subjects : [subjects];
    this.#callback = callback;
  }

  #compute(): R {
    return this.#callback(...this.#subjects.map((s) => s.value));
  }

  /**
   * Subscribe to every source subject and call `onChange(value)` once with
   * the current derived value, then again whenever the *derived* output
   * actually changes (per-subscription memoization via Object.is).
   *
   * This is what makes O(1) updates possible when many derived's depend on
   * the same source: if a row's class derivation produces "" before and after
   * a selection change, that row's onChange never fires.
   */
  #subscribeAll(onChange: (value: R) => void): () => void {
    let last: R;
    let primed = false;
    const recompute = () => {
      const next = this.#compute();
      if (primed && Object.is(last, next)) return;
      primed = true;
      last = next;
      onChange(next);
    };
    const unsubs = this.#subjects.map((s) =>
      s.subscribe({ update: recompute }, false),
    );
    recompute();
    return () => unsubs.forEach((u) => u());
  }

  attachAttribute(element: Element, attribute: string) {
    const unsubscribe = this.#subscribeAll((value) => {
      setReactiveAttribute(element, attribute, value);
    });
    unsubscribeOnElementRemoved(element, unsubscribe);
  }

  attachNode(parent: Node, before?: Node | null) {
    const start = document.createComment("interp-start");
    const end = document.createComment("interp-end");
    insertBefore(parent, start, before ?? null);
    insertBefore(parent, end, before ?? null);

    const removeBetween = () => {
      let node = start.nextSibling;
      while (node && node !== end) {
        const next = node.nextSibling;
        node.remove();
        node = next;
      }
    };

    const unsubscribe = this.#subscribeAll((value) => {
      removeBetween();
      if (Array.isArray(value)) {
        start.after(...(value as Node[]));
      } else if (value instanceof Node) {
        start.after(value);
      } else {
        start.after(document.createTextNode(`${value}`));
      }
    });

    unsubscribeOnElementRemoved(start, unsubscribe);
  }

  get subjects(): readonly Subject<any>[] {
    return this.#subjects;
  }
  get callback(): (...values: any[]) => R {
    return this.#callback;
  }
}

/**
 * Keyed list reconciliation. Given a Subject<T[]>, a key extractor, and a
 * render function, maintains a 1:1 mapping between input items and DOM nodes
 * across updates. Items that vanish are removed; new items are rendered;
 * surviving items are reordered with `prev.after(node)` (which detaches and
 * reinserts in one step).
 *
 * This is the keyed analogue to `using(items, items => items.map(render))` —
 * the using() form rebuilds every node on every change.
 */
export class EachDirective<T> {
  #items: Subject<T[]>;
  #keyFn: (item: T, index: number) => unknown;
  #renderFn: (item: T, index: number) => Node;

  constructor(
    items: Subject<T[]>,
    keyFn: (item: T, index: number) => unknown,
    renderFn: (item: T, index: number) => Node,
  ) {
    this.#items = items;
    this.#keyFn = keyFn;
    this.#renderFn = renderFn;
  }

  attachNode(parent: Node, before?: Node | null) {
    const start = document.createComment("each-start");
    const end = document.createComment("each-end");
    insertBefore(parent, start, before ?? null);
    insertBefore(parent, end, before ?? null);
    const host = parent;

    const cache = new Map<unknown, Node>();
    let prevKeys: unknown[] = [];

    const reconcile = (items: T[]) => {
      const newKeys: unknown[] = new Array(items.length);
      const seen = new Set<unknown>();
      for (let i = 0; i < items.length; i++) {
        const k = this.#keyFn(items[i], i);
        newKeys[i] = k;
        seen.add(k);
      }

      // remove vanished
      for (let i = 0; i < prevKeys.length; i++) {
        const key = prevKeys[i];
        if (!seen.has(key)) {
          const node = cache.get(key);
          if (node) (node as ChildNode).remove();
          cache.delete(key);
        }
      }

      // For each new index, compute its old index (in surviving prev order),
      // or -1 if the key is new. The LIS over this permutation tells us which
      // surviving nodes are already in correct relative order — those don't
      // need to move.
      const oldIndexOfKey = new Map<unknown, number>();
      let oldIdx = 0;
      for (let i = 0; i < prevKeys.length; i++) {
        if (seen.has(prevKeys[i])) oldIndexOfKey.set(prevKeys[i], oldIdx++);
      }
      const perm: number[] = new Array(newKeys.length);
      for (let i = 0; i < newKeys.length; i++) {
        const oi = oldIndexOfKey.get(newKeys[i]);
        perm[i] = oi === undefined ? -1 : oi;
      }
      const stable = lisIndexSet(perm);

      // Walk from end to start, using each position's intended next-sibling
      // as the anchor. New keys always insert; surviving keys move only when
      // they're not in the LIS.
      let anchor: Node = end;
      for (let i = newKeys.length - 1; i >= 0; i--) {
        const key = newKeys[i];
        let node = cache.get(key);
        if (!node) {
          node = this.#renderFn(items[i], i);
          cache.set(key, node);
          host.insertBefore(node, anchor);
        } else if (!stable.has(i)) {
          host.insertBefore(node, anchor);
        }
        anchor = node;
      }

      prevKeys = newKeys;
    };

    const unsubscribe = this.#items.subscribe({ update: reconcile }, true);
    unsubscribeOnElementRemoved(start, unsubscribe);
  }
}

const insertBefore = (parent: Node, node: Node, before: Node | null) => {
  parent.insertBefore(node, before);
};

/**
 * Returns the set of indices of `arr` that form one longest-increasing
 * subsequence. Indices where `arr[i] === -1` are skipped (they represent new
 * items that always need insertion regardless).
 *
 * Patience-sort variant: O(n log n).
 */
const lisIndexSet = (arr: number[]): Set<number> => {
  const n = arr.length;
  const tails: number[] = [];
  const prev: number[] = new Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    if (arr[i] === -1) continue;
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arr[tails[mid]] < arr[i]) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) prev[i] = tails[lo - 1];
    if (lo === tails.length) tails.push(i);
    else tails[lo] = i;
  }
  const result = new Set<number>();
  let k = tails.length > 0 ? tails[tails.length - 1] : -1;
  while (k !== -1) {
    result.add(k);
    k = prev[k];
  }
  return result;
};

/* ------------------------------------------------------------------ */
/* value application — used by the template-cache layer to fill holes */
/* ------------------------------------------------------------------ */

/**
 * Append a node-position value to `parent`, optionally before a reference
 * node. Handles primitives, Nodes, arrays, Subjects, and Deriveds (the latter
 * two install bindings).
 */
export const appendNodeValue = (
  parent: Node,
  value: NodeInterpolatedValue,
  before: Node | null = null,
): void => {
  if (isPrimitive(value)) {
    insertBefore(parent, document.createTextNode(`${value}`), before);
  } else if (value instanceof Node) {
    insertBefore(parent, value, before);
  } else if (value instanceof Derived) {
    value.attachNode(parent, before);
  } else if (value instanceof EachDirective) {
    value.attachNode(parent, before);
  } else if (isSubject(value)) {
    attachSubjectNode(value, parent, before);
  } else if (Array.isArray(value)) {
    for (const item of value)
      appendNodeValue(parent, item as NodeInterpolatedValue, before);
  } else {
    throw new Error(
      `Failed to interpolate node value: ${value} (type ${typeof value})`,
    );
  }
};

/**
 * Apply a value to an attribute slot (placeholder occupying a whole attribute
 * position, e.g. `<div ${subjective(...)} />`). Only `subjective(...)` and
 * `on(...)` are valid here.
 */
export const applyAttrSlot = (element: Element, value: unknown): void => {
  if (isSubjectiveAttributesInterp(value)) {
    value.attachSubscriptions(element);
  } else if (isEventHandlersInterp(value)) {
    value.attachHandlers(element);
  } else {
    throw new Error(
      `Attribute slot must be subjective(...) or on(...), got ${typeof value}`,
    );
  }
};

const attachSubjectNode = <T>(
  subject: Subject<T>,
  parent: Node,
  before: Node | null,
) => {
  const node = document.createTextNode("");
  const unsubscribe = subject.subscribe(
    {
      update(newValue) {
        node.textContent = `${newValue}`;
      },
    },
    true,
  );
  unsubscribeOnElementRemoved(node, unsubscribe);
  insertBefore(parent, node, before);
};

const attachSubjectAttribute = <T>(
  subject: Subject<T>,
  element: Element,
  attribute: string,
) => {
  const unsubscribe = subject.subscribe(
    {
      update(newValue) {
        setReactiveAttribute(element, attribute, newValue);
      },
    },
    true,
  );
  unsubscribeOnElementRemoved(element, unsubscribe);
};

/**
 * Apply a reactive value to an attribute. Handles three cases:
 *   - `true`  → presence (empty value), as boolean attributes care about
 *               presence not content (`disabled="false"` still disables).
 *   - `false` / `null` / `undefined` → remove the attribute.
 *   - anything else → setAttribute(name, String(value)).
 */
const setReactiveAttribute = (
  element: Element,
  name: string,
  value: unknown,
): void => {
  if (value === false || value === null || value === undefined) {
    element.removeAttribute(name);
  } else if (value === true) {
    element.setAttribute(name, "");
  } else {
    element.setAttribute(name, `${value}`);
  }
};

/* ----------------------------- types ----------------------------- */

type OneOrMany<T> = T | Array<T>;

export {
  type InterpolatedValue,
  type NodeInterpolatedValue,
  type AttributeInterpolatedValue,
};

type InterpolatedValue = NodeInterpolatedValue | AttributeInterpolatedValue;

type NodeInterpolatedValue = OneOrMany<
  number | string | Node | Subject<any> | Derived<any> | EachDirective<any>
>;

type AttributeInterpolatedValue =
  | number
  | string
  | AttributeInterpolation<"subjectiveAttributes">
  | AttributeInterpolation<"eventHandlers">;

type EventHandlerInterpolationData = Partial<{
  [k in keyof HTMLElementEventMap]: (event: Event) => any;
}>;

type SubjectiveAttributeInterpolationData = Record<
  string,
  Subject<any> | Derived<any>
>;

export type AttributeInterpolationData<
  T extends "eventHandlers" | "subjectiveAttributes",
> = T extends "eventHandlers"
  ? EventHandlerInterpolationData
  : SubjectiveAttributeInterpolationData;

/**
 * Type to encapsulate attributes for more complex interpolation.
 */
export class AttributeInterpolation<
  T extends "eventHandlers" | "subjectiveAttributes",
> {
  static eventHandlers(data: AttributeInterpolationData<"eventHandlers">) {
    return new AttributeInterpolation(
      AttributeInterpolation.EVENT_HANDLERS,
      data,
    );
  }
  static subjectiveAttributes(
    data: AttributeInterpolationData<"subjectiveAttributes">,
  ) {
    return new AttributeInterpolation(
      AttributeInterpolation.SUBJECTIVE_ATTRIBUTES,
      data,
    );
  }
  static EVENT_HANDLERS = 0;
  static SUBJECTIVE_ATTRIBUTES = 1;
  #kind: number;
  #data: AttributeInterpolationData<T>;
  private constructor(kind: number, data: AttributeInterpolationData<T>) {
    this.#kind = kind;
    this.#data = data;
  }

  attachHandlers(element: Element) {
    if (this.#kind !== AttributeInterpolation.EVENT_HANDLERS) return;
    const cleanups: (() => void)[] = [];
    for (const [evt, listener] of Object.entries(
      this.#data as AttributeInterpolationData<"eventHandlers">,
    )) {
      const fn = listener as EventListener;
      element.addEventListener(evt, fn);
      cleanups.push(() => element.removeEventListener(evt, fn));
    }
    if (cleanups.length > 0) unsubscribeOnElementRemoved(element, cleanups);
  }

  attachSubscriptions(element: Element) {
    if (this.#kind !== AttributeInterpolation.SUBJECTIVE_ATTRIBUTES) return;
    Object.entries(
      this.#data as AttributeInterpolationData<"subjectiveAttributes">,
    ).forEach(([attr, subjectiveVal]) => {
      if (subjectiveVal instanceof Derived) {
        subjectiveVal.attachAttribute(element, attr);
      } else {
        attachSubjectAttribute(subjectiveVal, element, attr);
      }
    });
  }

  get data() {
    return this.#data;
  }

  get kind() {
    return this.#kind;
  }
}

export const isAttributesInterp = <
  T extends "subjectiveAttributes" | "eventHandlers",
>(
  v: any,
): v is AttributeInterpolation<T> => v instanceof AttributeInterpolation;

export const isSubjectiveAttributesInterp = (
  v: any,
): v is AttributeInterpolation<"subjectiveAttributes"> =>
  v instanceof AttributeInterpolation &&
  v.kind === AttributeInterpolation.SUBJECTIVE_ATTRIBUTES;

export const isEventHandlersInterp = (
  v: any,
): v is AttributeInterpolation<"eventHandlers"> =>
  v instanceof AttributeInterpolation &&
  v.kind === AttributeInterpolation.EVENT_HANDLERS;

export const isPrimitive = (v: unknown): v is string | number =>
  typeof v === "string" || typeof v === "number";
