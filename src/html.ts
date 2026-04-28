import { type InterpolatedValue } from "./interpolation";
import { render } from "./template";

/**
 * Tagged-template entry point. Routes through the cached-template renderer:
 * the first call for a given call site parses the static shape; subsequent
 * calls clone the parsed fragment and apply values.
 *
 * Returns a single HTMLElement when the template has exactly one root
 * element, otherwise a DocumentFragment.
 */
export function html(
  template: TemplateStringsArray,
  ...values: InterpolatedValue[]
): HTMLElement | DocumentFragment {
  if (template.length === 1) {
    // Static-only template — no caching cost worth recovering, just parse.
    return singleElementOrFragment(asFragment(template[0].trim()));
  }
  return singleElementOrFragment(render(template, values));
}

const asFragment = (htmlString: string): DocumentFragment => {
  const t = document.createElement("template");
  t.innerHTML = htmlString;
  return t.content;
};

const singleElementOrFragment = (frag: DocumentFragment) =>
  frag.childNodes.length === 1 && frag.firstChild instanceof HTMLElement
    ? frag.firstChild
    : frag;
