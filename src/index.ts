import { html } from "./html";
import { subject, type Subject } from "./subject";
import { AttrInterp, type AttrData } from "./attributes";

export { subject };
export default html;
/**
 * Interpolate event handlers
 */
export const on = (data: AttrData<"eventHandlers">) =>
  AttrInterp.eventHandlers(data);

/**
 * Shorthand to ensure dependencies are correctly typed for typescript
 */
export const using = <T, R>(
  subject: Subject<T>,
  callback: (v: T) => R,
): [Subject<T>, (v: T) => R] => [subject, callback];

/**
 * Interpolate attributes that respond to subjects
 */
export const subjective = (data: AttrData<"subjectiveAttributes">) =>
  AttrInterp.subjectiveAttributes(data);
