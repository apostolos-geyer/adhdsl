import { html } from "./html";
import { subject, batch, type Subject } from "./subject";
import {
  Derived,
  EachDirective,
  AttributeInterpolation,
  type AttributeInterpolationData,
} from "./interpolation";

export { subject, batch, Derived, EachDirective };
export type { Subject };
export default html;

/**
 * Interpolate event handlers
 */
export const on = (data: AttributeInterpolationData<"eventHandlers">) =>
  AttributeInterpolation.eventHandlers(data);

/**
 * Interpolate attributes that respond to subjects
 */
export const subjective = (
  data: AttributeInterpolationData<"subjectiveAttributes">,
) => AttributeInterpolation.subjectiveAttributes(data);

type SubjectValues<T extends readonly Subject<any>[]> = {
  [K in keyof T]: T[K] extends Subject<infer V> ? V : never;
};

/**
 * Wraps one or more subjects with a transform.
 *
 * Single source: `using(counter, n => \`clicked \${n}\`)`
 * Multiple sources: `using([a, b], (a, b) => a + b)`
 */
export function using<T, R>(
  subject: Subject<T>,
  callback: (value: T) => R,
): Derived<R>;
export function using<T extends readonly Subject<any>[], R>(
  subjects: [...T],
  callback: (...values: SubjectValues<T>) => R,
): Derived<R>;
export function using(
  subjectOrSubjects: Subject<any> | readonly Subject<any>[],
  callback: (...values: any[]) => any,
): Derived<any> {
  return new Derived(subjectOrSubjects, callback);
}

/**
 * Keyed list rendering. Use this instead of `using(items, items => items.map(render))`
 * when items have stable identity — surviving items keep their DOM nodes
 * across updates instead of being torn down and rebuilt.
 *
 * ```ts
 * each(todos, todo => todo.id, todo => html`<li>${todo.text}</li>`)
 * ```
 */
export const each = <T>(
  items: Subject<T[]>,
  keyFn: (item: T, index: number) => unknown,
  renderFn: (item: T, index: number) => Node,
): EachDirective<T> => new EachDirective(items, keyFn, renderFn);
