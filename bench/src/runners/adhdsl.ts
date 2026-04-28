import html, {
  subject,
  using,
  each,
  on,
  subjective,
  batch,
  type Subject,
} from "adhdsl";
import { buildRows, newLabel, type Row } from "../data";
import type { Runner } from "../runner";

type Item = {
  id: number;
  label: Subject<string>;
};

export const adhdsl = (): Runner => {
  let container: HTMLElement;
  const items = subject<Item[]>([]);
  const selectedId = subject<number | null>(null);

  const renderRow = (item: Item): HTMLTableRowElement => {
    const danger = using(selectedId, (id: number | null) =>
      id === item.id ? "danger" : "",
    );
    return html`
      <tr ${subjective({ class: danger })} ${on({ click: () => selectedId.set(item.id) })}>
        <td>${item.id}</td>
        <td>${item.label}</td>
      </tr>
    ` as HTMLTableRowElement;
  };

  const toItems = (rows: Row[]): Item[] =>
    rows.map((r) => ({ id: r.id, label: subject(r.label) }));

  return {
    name: "adhdsl",
    mount(host) {
      container = host;
      const view = html`
        <table>
          <tbody>
            ${each(items, (item: Item) => item.id, renderRow)}
          </tbody>
        </table>
      `;
      container.appendChild(view);
    },
    unmount() {
      container.innerHTML = "";
      items.set([]);
      selectedId.set(null);
    },
    create(n) {
      items.set(toItems(buildRows(n)));
    },
    partialUpdate() {
      const list = items.value;
      batch(() => {
        for (let i = 0; i < list.length; i += 10) {
          list[i].label.set(newLabel());
        }
      });
    },
    swap() {
      const list = items.value;
      if (list.length < 999) return;
      const next = list.slice();
      const a = 1;
      const b = next.length - 2;
      [next[a], next[b]] = [next[b], next[a]];
      items.set(next);
    },
    select(index) {
      const list = items.value;
      const target = list[index];
      if (target) selectedId.set(target.id);
    },
    append(n) {
      items.set(items.value.concat(toItems(buildRows(n))));
    },
    clear() {
      items.set([]);
      selectedId.set(null);
    },
  };
};
