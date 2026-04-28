import {
  appendNodeValue,
  applyAttrSlot,
  isPrimitive,
  type InterpolatedValue,
} from "./interpolation";

/**
 * Template caching: each tagged-template call site has a stable
 * `TemplateStringsArray` identity. We parse the static shape of the template
 * once, record where every interpolation lands in the parsed DOM, and on
 * subsequent renders just clone the parsed fragment and walk the recorded
 * paths to apply the new values.
 *
 * This is the same trick lit-html uses to avoid reparsing HTML on every
 * render — which is the single biggest perf gap between a runtime templating
 * system and a compiled one.
 */

type Hole =
  | { kind: "node"; path: number[]; valueIndex: number }
  | {
      kind: "attrSlot";
      path: number[];
      valueIndex: number;
      attrName: string;
    }
  | {
      kind: "attrText";
      path: number[];
      attrName: string;
      staticParts: string[];
      valueIndices: number[];
    };

type CachedTemplate = {
  fragment: DocumentFragment;
  holes: Hole[];
};

const templateCache = new WeakMap<TemplateStringsArray, CachedTemplate>();

const SENTINEL_OPEN = "__ADHDSL_HOLE_";
const SENTINEL_CLOSE = "__";
const SENTINEL_RE = /__ADHDSL_HOLE_(\d+)__/g;
const ATTR_SLOT_PREFIX = "data-h-attr-";
const NODE_HOLE_ATTR = "data-h-node";

/* ------------------------------------------------------------------ */
/* parser state machine                                                */
/* ------------------------------------------------------------------ */

type CursorState = "outside" | "inTag" | "inString";

type Cursor = {
  /** Advance through `segment`. Returns the state at the end. */
  advance: (segment: string) => CursorState;
};

const createCursor = (): Cursor => {
  let inTag = false;
  let inString: '"' | "'" | null = null;
  let inComment = false;

  const advance = (segment: string): CursorState => {
    for (let i = 0; i < segment.length; i++) {
      const ch = segment[i];
      if (inComment) {
        if (segment.startsWith("-->", i)) {
          inComment = false;
          i += 2;
        }
        continue;
      }
      if (inString) {
        if (ch === inString) inString = null;
        continue;
      }
      if (inTag) {
        if (ch === '"' || ch === "'") inString = ch;
        else if (ch === ">") inTag = false;
        continue;
      }
      if (segment.startsWith("<!--", i)) {
        inComment = true;
        i += 3;
      } else if (ch === "<") {
        inTag = true;
      }
    }
    if (inString) return "inString";
    if (inTag) return "inTag";
    return "outside";
  };

  return { advance };
};

/* ------------------------------------------------------------------ */
/* build phase — runs once per TemplateStringsArray                    */
/* ------------------------------------------------------------------ */

const buildTemplate = (template: TemplateStringsArray): CachedTemplate => {
  let html = "";
  const holeKinds: CursorState[] = [];
  const cursor = createCursor();

  for (let i = 0; i < template.length; i++) {
    html += template[i];
    if (i < template.length - 1) {
      const state = cursor.advance(template[i]);
      holeKinds.push(state);
      if (state === "inString") {
        html += `${SENTINEL_OPEN}${i}${SENTINEL_CLOSE}`;
      } else if (state === "inTag") {
        html += ` ${ATTR_SLOT_PREFIX}${i}=""`;
      } else {
        html += `<template ${NODE_HOLE_ATTR}="${i}"></template>`;
      }
    }
  }

  const tpl = document.createElement("template");
  tpl.innerHTML = html.trim();
  const fragment = tpl.content;

  const holes: Hole[] = [];
  walkAndRecord(fragment, [], holes);

  return { fragment, holes };
};

const walkAndRecord = (node: Node, path: number[], holes: Hole[]): void => {
  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as Element;

    // node-position placeholder: <template data-h-node="i">
    if (el.tagName === "TEMPLATE" && el.hasAttribute(NODE_HOLE_ATTR)) {
      const valueIndex = parseInt(el.getAttribute(NODE_HOLE_ATTR)!, 10);
      holes.push({ kind: "node", path: [...path], valueIndex });
      // Don't recurse — placeholder template content is irrelevant.
      return;
    }

    const attrSlots: string[] = [];
    for (const attr of Array.from(el.attributes)) {
      if (attr.name.startsWith(ATTR_SLOT_PREFIX)) {
        const valueIndex = parseInt(
          attr.name.slice(ATTR_SLOT_PREFIX.length),
          10,
        );
        holes.push({
          kind: "attrSlot",
          path: [...path],
          valueIndex,
          attrName: attr.name,
        });
        attrSlots.push(attr.name);
      } else if (attr.value.includes(SENTINEL_OPEN)) {
        const value = attr.value;
        const staticParts: string[] = [];
        const valueIndices: number[] = [];
        SENTINEL_RE.lastIndex = 0;
        let lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = SENTINEL_RE.exec(value)) !== null) {
          staticParts.push(value.slice(lastIndex, match.index));
          valueIndices.push(parseInt(match[1], 10));
          lastIndex = SENTINEL_RE.lastIndex;
        }
        staticParts.push(value.slice(lastIndex));
        holes.push({
          kind: "attrText",
          path: [...path],
          attrName: attr.name,
          staticParts,
          valueIndices,
        });
      }
    }
    // Strip slot attributes from cached fragment so clones don't carry them.
    for (const name of attrSlots) el.removeAttribute(name);
  }

  for (let i = 0; i < node.childNodes.length; i++) {
    walkAndRecord(node.childNodes[i], [...path, i], holes);
  }
};

/* ------------------------------------------------------------------ */
/* render phase — runs every call                                      */
/* ------------------------------------------------------------------ */

const walkPath = (root: Node, path: number[]): Node => {
  let node: Node = root;
  for (const i of path) node = node.childNodes[i];
  return node;
};

const renderTemplate = (
  cached: CachedTemplate,
  values: InterpolatedValue[],
): DocumentFragment => {
  const cloned = cached.fragment.cloneNode(true) as DocumentFragment;

  // Capture every placeholder reference BEFORE we start mutating, since
  // node-hole replacements may insert multiple nodes and shift sibling
  // indices for any later path that targets a sibling.
  const refs: Node[] = cached.holes.map((h) => walkPath(cloned, h.path));

  for (let i = 0; i < cached.holes.length; i++) {
    const hole = cached.holes[i];
    const target = refs[i];

    switch (hole.kind) {
      case "node": {
        const value = values[hole.valueIndex] as any;
        const placeholder = target as Element;
        const parent = placeholder.parentNode!;
        // Insert new content right before the placeholder, then remove it.
        appendNodeValue(parent, value, placeholder);
        placeholder.remove();
        break;
      }
      case "attrSlot": {
        const element = target as Element;
        applyAttrSlot(element, values[hole.valueIndex]);
        break;
      }
      case "attrText": {
        const element = target as Element;
        let result = hole.staticParts[0];
        for (let i = 0; i < hole.valueIndices.length; i++) {
          const v = values[hole.valueIndices[i]];
          if (!isPrimitive(v)) {
            throw new Error(
              `Mid-attribute interpolation requires a primitive (string or number); got ${typeof v}. Use subjective({ ${hole.attrName}: ... }) for reactive attributes.`,
            );
          }
          result += `${v}` + hole.staticParts[i + 1];
        }
        element.setAttribute(hole.attrName, result);
        break;
      }
    }
  }

  return cloned;
};

/* ------------------------------------------------------------------ */
/* public entry point                                                  */
/* ------------------------------------------------------------------ */

export const render = (
  template: TemplateStringsArray,
  values: InterpolatedValue[],
): DocumentFragment => {
  let cached = templateCache.get(template);
  if (!cached) {
    cached = buildTemplate(template);
    templateCache.set(template, cached);
  }
  return renderTemplate(cached, values);
};
