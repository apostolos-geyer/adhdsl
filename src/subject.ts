/**
 * observer interface
 */
type Observer<T> = {
  update(value: T): void;
};

/**
 * subject interface
 */
interface Subject<T> {
  get value(): T;
  set(arg: SetValueOrCallback<T>): void;
  subscribe(o: Observer<T>, invoke: boolean): () => void;
}

/**
 * Batch handle: while non-null, set() routes notifications here instead of
 * firing them synchronously. On batch exit each touched subject is notified
 * exactly once with its final value.
 */
let activeBatch: Set<BaseSubject<any>> | null = null;

/**
 * Coalesce multiple .set() calls into a single notification per subject.
 * Nested batches are flattened — only the outermost flushes.
 */
export const batch = <T>(fn: () => T): T => {
  if (activeBatch !== null) return fn();
  const dirty: Set<BaseSubject<any>> = new Set();
  activeBatch = dirty;
  try {
    return fn();
  } finally {
    activeBatch = null;
    for (const s of dirty) s._notifyAll();
  }
};

/**
 * basic subject implementation
 */
class BaseSubject<T> implements Subject<T> {
  #value: T;
  #observers: Set<Observer<T>> = new Set();
  #equals: (a: T, b: T) => boolean;

  constructor(init: T, equals: (a: T, b: T) => boolean = Object.is) {
    this.#value = init;
    this.#equals = equals;
  }

  get value(): T {
    return this.#value;
  }

  set(arg: SetValueOrCallback<T>) {
    const next =
      typeof arg === "function" ? (arg as UpdateFn<T>)(this.#value) : arg;
    if (this.#equals(next, this.#value)) return;
    this.#value = next;
    if (activeBatch) activeBatch.add(this);
    else this.#notify();
  }

  subscribe(o: Observer<T>, invoke: boolean) {
    this.#observers.add(o);
    if (invoke) o.update(this.#value);
    return () => {
      this.#observers.delete(o);
    };
  }

  /** internal — used by `batch` to flush at end of batch */
  _notifyAll() {
    this.#notify();
  }

  #notify() {
    const v = this.#value;
    for (const o of this.#observers) o.update(v);
  }
}

/**
 * initialize a basic subject, atomic piece of reactivity.
 *
 * Pass `equals` to override the default `Object.is` short-circuit (e.g. when
 * you mutate-then-set the same array and want notifications anyway).
 */
const subject = <T>(
  v: T,
  opts?: { equals?: (a: T, b: T) => boolean },
): BaseSubject<T> => new BaseSubject(v, opts?.equals);

/**
 * check if an object is a subject
 */
const isSubject = <T>(v: any): v is Subject<T> =>
  v instanceof BaseSubject ||
  (v !== null &&
    typeof v === "object" &&
    "value" in v &&
    typeof v.set === "function" &&
    typeof v.subscribe === "function");

export { type Observer, type Subject, BaseSubject, isSubject, subject };

type UpdateFn<T> = (v: T) => T;
type SetValueOrCallback<T> = T | UpdateFn<T>;

/**
 * Ensure that the unsubscribe callback is used when the
 * node is removed from the DOM preventing unnecessary
 * function calls and memory leaks.
 *
 * Returns the same unsubscribe function passed in.
 */
export const unsubscribeOnElementRemoved = (
  element: Node,
  unsubscribe: (() => void) | (() => void)[],
) => {
  ensureRemovalObserver();
  let unsubscribesForElement = unsubscribeMap.get(element);
  if (!unsubscribesForElement) {
    unsubscribesForElement = new Set();
    unsubscribeMap.set(element, unsubscribesForElement);
  }

  if (Array.isArray(unsubscribe)) {
    unsubscribe.forEach((fn) => unsubscribesForElement!.add(fn));
  } else {
    unsubscribesForElement.add(unsubscribe);
  }

  return unsubscribe;
};

const cleanupSubscriptions = (el: Node) => {
  const subscriptions = unsubscribeMap.get(el);
  if (!subscriptions) return;
  subscriptions.forEach((unsubscribe) => unsubscribe());
  unsubscribeMap.delete(el);
};
const unsubscribeMap = new WeakMap<Node, Set<() => void>>();

let removalObserver: MutationObserver | undefined;

/**
 * Lazily start the global MutationObserver. Importing the library before
 * <body> exists (e.g. a script in <head> without `defer`) shouldn't blow up,
 * so we defer the observer until the body is reachable.
 */
const ensureRemovalObserver = () => {
  if (removalObserver || typeof document === "undefined") return;
  if (!document.body) {
    document.addEventListener("DOMContentLoaded", ensureRemovalObserver, {
      once: true,
    });
    return;
  }
  removalObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.removedNodes.forEach((node) => {
        // Per DOM spec, inserting a node that's already in the tree first
        // *removes* it (firing a removedNodes record) and then re-inserts.
        // By the time this microtask runs, the node is back in the tree if
        // it was a move. Tearing down its subscriptions would silently
        // break a row that just got reordered (e.g. by `each`'s LIS
        // reconciler swapping two rows). Skip cleanup for moves.
        if (node.isConnected) return;
        cleanupSubscriptions(node);
        // Descendants of a removed subtree don't fire their own removal
        // mutations, so walk the subtree to clean them up too.
        if (node.hasChildNodes && node.hasChildNodes()) {
          const walker = document.createTreeWalker(node, NodeFilter.SHOW_ALL);
          let child = walker.nextNode();
          while (child) {
            cleanupSubscriptions(child);
            child = walker.nextNode();
          }
        }
      });
    }
  });
  removalObserver.observe(document.body, { childList: true, subtree: true });
};
