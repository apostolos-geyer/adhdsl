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
 * basic subject implementation
 */
class BaseSubject<T> implements Subject<T> {
  private __value: T;
  private __observers: Set<Observer<T>> = new Set();
  constructor(init: T) {
    this.__value = init;
  }
  get value(): T {
    return this.__value;
  }
  set(arg: SetValueOrCallback<T>) {
    this.__value =
      typeof arg === "function" ? (arg as UpdateFn<T>)(this.__value) : arg;
    this.__notifyObservers();
  }

  subscribe(o: Observer<T>, invoke: boolean) {
    this.__observers.add(o);
    if (invoke) {
      o.update(this.__value);
    }
    return () => {
      this.__observers.delete(o);
    };
  }

  private __notifyObservers() {
    const v = this.__value;
    for (const o of this.__observers) {
      o.update(v);
    }
  }
}

/**
 * initialize a basic subject, atomic piece of reactivity.
 */
const subject = <T>(v: T): BaseSubject<T> => new BaseSubject(v);

/**
 * check if an object is a subject
 */
const isSubject = <T>(v: any): v is Subject<T> =>
  v instanceof BaseSubject ||
  (v !== null &&
    typeof v === "object" &&
    typeof v.get === "function" &&
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
 * Returns the same unsubscribe function passed in
 */
export const unsubscribeOnElementRemoved = (
  element: Node,
  unsubscribe: (() => void) | (() => void)[],
) => {
  let unsubscribesForElement = unsubscribeMap.get(element);
  if (!unsubscribesForElement) {
    unsubscribeMap.set(element, new Set());
    unsubscribesForElement = unsubscribeMap.get(element) as Set<() => void>; // invariant
  }

  if (Array.isArray(unsubscribe))
    unsubscribe.forEach((unsubscribeFn) =>
      unsubscribesForElement.add(unsubscribeFn),
    );
  else unsubscribesForElement.add(unsubscribe);

  return unsubscribe;
};

const cleanupSubscriptions = (el: Node) => {
  const subscriptions = unsubscribeMap.get(el);
  if (!subscriptions) return;
  subscriptions.forEach((unsubscribe) => unsubscribe());
  unsubscribeMap.delete(el);
};
const unsubscribeMap = new WeakMap<Node, Set<() => void>>();

const removalObserver = new MutationObserver(
  (mutations: Array<MutationRecord>) => {
    for (const mutation of mutations) {
      mutation.removedNodes.forEach((node) => {
        cleanupSubscriptions(node);
      });
    }
  },
);

removalObserver.observe(document.body, { childList: true, subtree: true });
