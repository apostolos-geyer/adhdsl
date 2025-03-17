/**
 * Logic for interpolating attributes of tags
 *
 */

import { type Subject } from "./subject";

export type AttrData<T extends "eventHandlers" | "subjectiveAttributes"> =
  T extends "eventHandlers"
  ? Partial<{ [K in keyof HTMLElementEventMap]: (event: Event) => any }>
  : Record<string, Subject<any> | SubjectAndCallback<any>>;

/**
 * Type to encapsulate attributes for more complex interpolation.
 * Currently for event listeners, and attributes that respond to subjects.
 * Exists pretty much to provide an easy way to discern what we're interpolating
 * by using an `instanceof` check rather than introspecting an object.
 */
export class AttrInterp<T extends "eventHandlers" | "subjectiveAttributes"> {
  static eventHandlers(data: AttrData<"eventHandlers">) {
    return new AttrInterp(AttrInterp.EVENT_HANDLERS, data);
  }

  static subjectiveAttributes(data: AttrData<"subjectiveAttributes">) {
    return new AttrInterp(AttrInterp.SUBJECTIVE_ATTRIBUTES, data);
  }
  static EVENT_HANDLERS = 0;
  static SUBJECTIVE_ATTRIBUTES = 1;
  private __kind: number;
  private __data: AttrData<T>;
  private constructor(kind: number, data: AttrData<T>) {
    this.__kind = kind;
    this.__data = data;
  }

  /**
   * Attach handlers to the element, if any
   */
  attachHandlers(element: Element) {
    if (this.kind !== AttrInterp.EVENT_HANDLERS) {
      return;
    } else {
      Object.entries(this.__data as AttrData<"eventHandlers">).forEach(
        ([evt, listener]) => {
          element.addEventListener(evt, listener);
        },
      );
    }
  }

  /**
   * Attach subscriptions, such that when the subject changes the attributes
   * will be updated accordingly. Returns the unsubscribe callbacks.
   */
  attachSubscriptions(element: Element) {
    return this.kind !== AttrInterp.SUBJECTIVE_ATTRIBUTES
      ? []
      : Object.entries(this.__data as AttrData<"subjectiveAttributes">).map(
        ([attr, subjectOrCallback]) =>
          Array.isArray(subjectOrCallback)
            ? subjectOrCallback[0].subscribe(
              {
                update(newValue) {
                  element.setAttribute(
                    attr,
                    subjectOrCallback[1](newValue),
                  );
                },
              },
              true,
            )
            : subjectOrCallback.subscribe(
              {
                update(newValue) {
                  element.setAttribute(attr, newValue);
                },
              },
              true,
            ),
      );
  }

  get data() {
    return this.__data;
  }

  get kind() {
    return this.__kind;
  }
}

export const isAttributesInterp = <
  T extends "subjectiveAttributes" | "eventHandlers",
>(
  v: any,
): v is AttrInterp<T> => v instanceof AttrInterp;

export const isSubjectiveAttributesInterp = (
  v: any,
): v is AttrInterp<"subjectiveAttributes"> =>
  v instanceof AttrInterp && v.kind === AttrInterp.SUBJECTIVE_ATTRIBUTES;

export const isEventHandlersInterp = (
  v: any,
): v is AttrInterp<"eventHandlers"> =>
  v instanceof AttrInterp && v.kind === AttrInterp.EVENT_HANDLERS;

type SubjectAndCallback<T> = [Subject<T>, (v: T) => any];
