import {
  AttrInterp,
  isEventHandlersInterp,
  isSubjectiveAttributesInterp,
} from "./attributes";
import {
  unsubscribeOnElementRemoved,
  type Subject,
  isSubject,
} from "./subject";

const interpDatasets = {
  subjectiveAttributes: "data-attr-interp",
  eventHandlers: "data-handler-interp",
  node: "data-node-interp",
} as const;

const interpPlaceholders = {
  subjectiveAttributes: (i: number) =>
    `${interpDatasets.subjectiveAttributes}=${i}`,
  eventHandlers: (i: number) => `${interpDatasets.eventHandlers}=${i}`,
  node: (i: number) => `<template ${interpDatasets.node}=${i}></template>`,
} as const;

const interpSelectors = {
  subjectiveAttributes: (content: DocumentFragment) =>
    content.querySelectorAll(`[${interpDatasets.subjectiveAttributes}]`),
  eventHandlers: (content: DocumentFragment) =>
    content.querySelectorAll(`[${interpDatasets.eventHandlers}]`),
  node: (content: DocumentFragment) =>
    content.querySelectorAll(`template[${interpDatasets.node}]`),
};

/**
 * Returns function to create placeholder, and function to do all interpolation
 * for attributes.
 */
export function initAttributePlaceholders(
  values: any[],
): [(index: number) => string, (content: DocumentFragment) => void] {
  //any is safe here because we narrow types throughout
  const subjectiveAttrPlaceholders: AttrInterp<"subjectiveAttributes">[] = [];
  const eventHandlerPlaceholders: AttrInterp<"eventHandlers">[] = [];

  const addPlaceholder = (index: number): string => {
    const value = values[index];
    let placeholder: string = "";
    if (isSubjectiveAttributesInterp(value)) {
      placeholder = interpPlaceholders.subjectiveAttributes(
        subjectiveAttrPlaceholders.length,
      );
      subjectiveAttrPlaceholders.push(value);
    } else if (isEventHandlersInterp(value)) {
      placeholder = interpPlaceholders.eventHandlers(
        eventHandlerPlaceholders.length,
      );
      eventHandlerPlaceholders.push(value);
    }
    return placeholder;
  };

  const interpolate = (content: DocumentFragment) => {
    interpSelectors.subjectiveAttributes(content).forEach((el) => {
      const i = extractIntAttribute(el, interpDatasets.subjectiveAttributes);
      const unsubs = subjectiveAttrPlaceholders[i].attachSubscriptions(el);
      unsubscribeOnElementRemoved(el, unsubs);
    });

    interpSelectors.eventHandlers(content).forEach((el) => {
      const i = extractIntAttribute(el, interpDatasets.eventHandlers);
      eventHandlerPlaceholders[i].attachHandlers(el);
    });
  };

  return [addPlaceholder, interpolate];
}

/**
 * Returns function to create placeholder, and function to do all interpolation
 * for nodes.
 */
export function initNodePlaceholders(
  values: any[],
): [(index: number) => string, (content: DocumentFragment) => void] {
  const nodePlaceholders: NodeInterpolatedValue[] = [];
  const addPlaceholder = (index: number): string => {
    const value = values[index];
    const templateNode = interpPlaceholders.node(nodePlaceholders.length);
    nodePlaceholders.push(value);
    return templateNode;
  };

  const interpolate = (content: DocumentFragment) => {
    const placeholderElements = interpSelectors.node(content);
    placeholderElements.forEach((el) => {
      const index = extractIntAttribute(el, interpDatasets.node);
      const replacement = nodePlaceholders[index];
      const frag = document.createDocumentFragment();
      // Recursively append replacement content.
      const appendReplacement = (rep: NodeInterpolatedValue) => {
        if (typeof rep === "string" || typeof rep === "number") {
          frag.appendChild(document.createTextNode(`${rep}`));
        } else if (isSubject(rep)) {
          console.log("inferred subject", rep, rep.value);
          const node = document.createTextNode("");
          const unsubscribe = rep.subscribe(
            {
              update(newValue) {
                node.textContent = `${newValue}`;
              },
            },
            true,
          );
          unsubscribeOnElementRemoved(node, unsubscribe);
          frag.appendChild(node);
        } else if (Array.isArray(rep)) {
          if (rep.length === 2) {
            const [first, second] = rep;
            if (isSubject(first)) {
              console.log("subject and callback");
              const node = document.createTextNode(`${first.value}`);
              const unsubscribe = first.subscribe(
                {
                  update(newValue) {
                    node.textContent = `${(second as (v: any) => any)(newValue)}`;
                  },
                },
                true,
              );
              unsubscribeOnElementRemoved(node, unsubscribe);
              frag.appendChild(node);
            } else {
              appendReplacement(first);
              appendReplacement(second as NodeInterpolatedValue);
            }
          } else {
            rep.forEach((item) =>
              appendReplacement(item as NodeInterpolatedValue),
            );
          }
        } else if (rep instanceof Node) {
          frag.appendChild(rep);
        } else {
          console.error("no matches for rep", {
            rep: rep,
          });
          console.error("failed to interpolate", rep, index, typeof rep, el);
          throw new Error(
            `Failed to interpolate value ${rep} of type ${typeof rep} for replacement index ${index}`,
          );
        }
      };
      appendReplacement(replacement);
      el.replaceWith(frag);
    });
  };

  return [addPlaceholder, interpolate];
}

const extractIntAttribute = (el: Element, attr: string) => {
  const elAttr = el.getAttribute(attr);
  if (!elAttr) {
    throw new Error(`Failed to extract attribute ${attr} from element`);
  }
  return parseInt(elAttr, 10);
};

type OneOrMany<T> = T | Array<T>;

type SubjectAndCallback<T> = [Subject<T>, (v: T) => any];

export {
  type InterpolatedValue,
  type NodeInterpolatedValue,
  type AttributeInterpolatedValue,
};

type InterpolatedValue = NodeInterpolatedValue | AttributeInterpolatedValue;

type NodeInterpolatedValue = OneOrMany<
  number | string | Node | Subject<any> | SubjectAndCallback<any>
>;

type AttributeInterpolatedValue =
  | number
  | string
  | AttrInterp<"subjectiveAttributes">
  | AttrInterp<"eventHandlers">;
