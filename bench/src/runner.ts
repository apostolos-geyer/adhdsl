export interface Runner {
  name: string;
  mount(container: HTMLElement): void;
  unmount(): void;
  /** Render a fresh list of `n` rows, replacing any existing rows. */
  create(n: number): void;
  /** Mutate the label of every 10th row. */
  partialUpdate(): void;
  /** Swap the row at index 1 with the row at index N-2. */
  swap(): void;
  /** Toggle a "danger" class on the row at the given index. */
  select(index: number): void;
  /** Append `n` rows to the existing list. */
  append(n: number): void;
  /** Remove every row. */
  clear(): void;
}
