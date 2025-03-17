import { isAttributesInterp } from "./attributes";

import {
  initNodePlaceholders,
  initAttributePlaceholders,
  type InterpolatedValue,
} from "./interpolation";

/**
 * A tagged template function that builds HTML elements in a safe way.
 *
 * In attribute positions (inside a tag) only strings are allowed and will be HTML-escaped.
 * In content positions, you may supply strings (or arrays of strings), HTMLElements (or arrays),
 * DocumentFragments, or HTMLComponents (or arrays thereof).
 *
 * The function returns either a single HTMLElement (if there is one root) or a DocumentFragment.
 */
export function html(
  template: TemplateStringsArray,
  ...values: InterpolatedValue[]
): HTMLElement | DocumentFragment {
  // If we only received one string in the template strings array,
  // then we invariably have no vales to interpolate.
  // Hence, we can just return the HTML.
  if (template.length === 1) {
    return singleElementOrFragment(asFragment(template[0].trim()));
  }

  // Otherwise, we need to a pass over the template, interpolating
  // what can be, and setting up placeholders for everything else.
  // in our initial pass over the template, the goal is to create a tree
  // that we can then use queries on to handle more
  // complex interpolations.
  let htmlString: string = "";

  const [addAttributePlaceholder, interpolateAttributePlaceholders] =
    initAttributePlaceholders(values);

  const [addNodePlaceholder, interpolateNodePlaceholders] =
    initNodePlaceholders(values);

  // We want to keep track of if we're in a tag or not, since it impacts what
  // we can interpolate and how it's handled
  let inTag: boolean = false;
  const inTagContext = (segment: string): boolean => {
    for (const char of segment) inTag = inTag ? char !== ">" : char === "<";
    return inTag;
  };

  const processSegment = (segment: string, i: number) => {
    // always add in the string content
    htmlString += segment;
    // if there's no more interpolation to do, return early, we dont care
    // if we're in a tag or not anymore
    if (i >= values.length) return;

    if (!inTagContext(segment)) {
      // side effect of adding values[i] to the placeholders
      htmlString += addNodePlaceholder(i);
      return;
    }

    // otherwise we're in an attribute context
    const value = values[i];
    if (typeof value === "string" || typeof value === "number") {
      // handle primitives easily
      htmlString += escapeHTML(`${value}`);
    } else if (isAttributesInterp(value)) {
      htmlString += addAttributePlaceholder(i);
    } else {
      throw new Error(
        `failed to interpolate ${i}'th value ${value} in attribute context. parsed: ${htmlString}. inTagContext: ${inTag}`,
      );
    }
  };

  // we handle the first and last segment separately so we don't get extraneous textnodes
  // from whitespace, leading to everything being a document fragment.
  const lastIdx = template.length - 1;
  processSegment(template[0].trimStart(), 0);
  for (let i = 1; i < lastIdx; i++) processSegment(template[i], i);
  processSegment(template[lastIdx].trimEnd(), lastIdx);

  const content = asFragment(htmlString);

  interpolateAttributePlaceholders(content);
  interpolateNodePlaceholders(content);

  return singleElementOrFragment(content);
}

/**
 * Escapes special HTML characters in a string.
 */
const escapeHTML = (str: string): string =>
  str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const asFragment = (htmlString: string): DocumentFragment => {
  const t = document.createElement("template");
  t.innerHTML = htmlString;
  return t.content;
};

const singleElementOrFragment = (frag: DocumentFragment) =>
  frag.childNodes.length === 1 && frag.firstChild instanceof HTMLElement
    ? frag.firstChild
    : frag;
