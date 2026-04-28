import { html, render } from "lit-html";
import { repeat } from "lit-html/directives/repeat.js";
import { classMap } from "lit-html/directives/class-map.js";
import { buildRows, newLabel, type Row } from "../data";
import type { Runner } from "../runner";

export const lit = (): Runner => {
  let container: HTMLElement;
  let rows: Row[] = [];
  let selectedId: number | null = null;

  const renderRow = (row: Row) => html`
    <tr
      class=${classMap({ danger: row.id === selectedId })}
      @click=${() => select(row.id)}
    >
      <td>${row.id}</td>
      <td>${row.label}</td>
    </tr>
  `;

  const draw = () => {
    render(
      html`
        <table>
          <tbody>
            ${repeat(rows, (r) => r.id, renderRow)}
          </tbody>
        </table>
      `,
      container,
    );
  };

  const select = (id: number | null) => {
    selectedId = id;
    draw();
  };

  return {
    name: "lit-html",
    mount(host) {
      container = host;
      draw();
    },
    unmount() {
      render(html``, container);
      rows = [];
      selectedId = null;
    },
    create(n) {
      rows = buildRows(n);
      draw();
    },
    partialUpdate() {
      // Mutate in place, then reassign reference so lit-html sees a change
      // and the repeat directive re-runs renderFn for matching keys.
      for (let i = 0; i < rows.length; i += 10) {
        rows[i] = { ...rows[i], label: newLabel() };
      }
      rows = rows.slice();
      draw();
    },
    swap() {
      if (rows.length < 999) return;
      const a = 1;
      const b = rows.length - 2;
      const next = rows.slice();
      [next[a], next[b]] = [next[b], next[a]];
      rows = next;
      draw();
    },
    select(index) {
      const target = rows[index];
      if (target) select(target.id);
    },
    append(n) {
      rows = rows.concat(buildRows(n));
      draw();
    },
    clear() {
      rows = [];
      selectedId = null;
      draw();
    },
  };
};
