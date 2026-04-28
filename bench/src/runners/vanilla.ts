import { buildRows, newLabel, type Row } from "../data";
import type { Runner } from "../runner";

export const vanilla = (): Runner => {
  let container: HTMLElement;
  let tbody: HTMLTableSectionElement;
  let rows: Row[] = [];
  const nodes = new Map<number, HTMLTableRowElement>();
  let selectedId: number | null = null;

  const renderRow = (row: Row): HTMLTableRowElement => {
    const tr = document.createElement("tr");
    tr.dataset.id = String(row.id);
    const idTd = document.createElement("td");
    idTd.textContent = String(row.id);
    const labelTd = document.createElement("td");
    labelTd.textContent = row.label;
    tr.append(idTd, labelTd);
    return tr;
  };

  return {
    name: "vanilla",
    mount(host) {
      container = host;
      const table = document.createElement("table");
      tbody = document.createElement("tbody");
      table.appendChild(tbody);
      container.appendChild(table);
    },
    unmount() {
      container.innerHTML = "";
      rows = [];
      nodes.clear();
      selectedId = null;
    },
    create(n) {
      tbody.textContent = "";
      nodes.clear();
      rows = buildRows(n);
      const frag = document.createDocumentFragment();
      for (const row of rows) {
        const node = renderRow(row);
        nodes.set(row.id, node);
        frag.appendChild(node);
      }
      tbody.appendChild(frag);
    },
    partialUpdate() {
      for (let i = 0; i < rows.length; i += 10) {
        const row = rows[i];
        row.label = newLabel();
        const node = nodes.get(row.id);
        if (node) node.children[1].textContent = row.label;
      }
    },
    swap() {
      if (rows.length < 999) return;
      const a = 1;
      const b = rows.length - 2;
      [rows[a], rows[b]] = [rows[b], rows[a]];
      const nodeA = nodes.get(rows[a].id)!;
      const nodeB = nodes.get(rows[b].id)!;
      const beforeB = nodeB.nextSibling;
      nodeA.replaceWith(nodeB);
      tbody.insertBefore(nodeA, beforeB);
    },
    select(index) {
      if (selectedId !== null) {
        nodes.get(selectedId)?.classList.remove("danger");
      }
      const target = rows[index];
      if (target) {
        const node = nodes.get(target.id);
        node?.classList.add("danger");
        selectedId = target.id;
      }
    },
    append(n) {
      const more = buildRows(n);
      const frag = document.createDocumentFragment();
      for (const row of more) {
        const node = renderRow(row);
        nodes.set(row.id, node);
        frag.appendChild(node);
      }
      rows = rows.concat(more);
      tbody.appendChild(frag);
    },
    clear() {
      tbody.textContent = "";
      nodes.clear();
      rows = [];
      selectedId = null;
    },
  };
};
