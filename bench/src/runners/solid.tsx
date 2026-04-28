import { createSignal, For } from "solid-js";
import { render } from "solid-js/web";
import { buildRows, newLabel, type Row } from "../data";
import type { Runner } from "../runner";

export const solid = (): Runner => {
  let container: HTMLElement;
  let dispose: (() => void) | null = null;

  // Lifted via closures — assigned in App so the runner methods can call them.
  let getRows!: () => Row[];
  let setRows!: (next: Row[]) => void;
  let getSelected!: () => number | null;
  let setSelected!: (next: number | null) => void;

  const App = () => {
    const [rows, _setRows] = createSignal<Row[]>([]);
    const [selectedId, _setSelected] = createSignal<number | null>(null);
    getRows = rows;
    setRows = _setRows;
    getSelected = selectedId;
    setSelected = _setSelected;

    return (
      <table>
        <tbody>
          <For each={rows()}>
            {(row) => (
              <tr
                classList={{ danger: selectedId() === row.id }}
                onClick={() => setSelected(row.id)}
              >
                <td>{row.id}</td>
                <td>{row.label}</td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    );
  };

  return {
    name: "solid",
    mount(host) {
      container = host;
      dispose = render(App, container);
    },
    unmount() {
      dispose?.();
      dispose = null;
      container.innerHTML = "";
    },
    create(n) {
      setRows(buildRows(n));
    },
    partialUpdate() {
      const list = getRows();
      const next = list.slice();
      for (let i = 0; i < next.length; i += 10) {
        next[i] = { ...next[i], label: newLabel() };
      }
      setRows(next);
    },
    swap() {
      const list = getRows();
      if (list.length < 999) return;
      const next = list.slice();
      const a = 1;
      const b = next.length - 2;
      [next[a], next[b]] = [next[b], next[a]];
      setRows(next);
    },
    select(index) {
      const target = getRows()[index];
      if (target) setSelected(target.id);
    },
    append(n) {
      setRows(getRows().concat(buildRows(n)));
    },
    clear() {
      setRows([]);
      setSelected(null);
    },
  };
};
