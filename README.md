# adhdsl

apostoli's dumb hypertext domain specific language

just another frontend reactivity library, because i think there wasnt enough of them yet
arose by accident because my class made me do a vanilla html/js assignment and i think signals are better than mvc, but
external libs weren't available, and what i ended up using was close enough to roll my own little reactivity and signals library.

## install:


( i think these work )

with bun:
```bash
bun install apostolos-geyer/adhdsl
```

with node:
```bash
npm install apostolos-geyer/adhdsl
```

deno users i have no clue. good luck.


## example usage:

there is only really a few things adhdsl does

1. provides subjects, which are essentially reactivity primitives a-la signals that can be used to interpolate
    values into your html, or into attributes of tags

2. allows interpolation of nodes (HTMLElement and such) without losing event listeners

3. allows event listeners to be written declaratively, because imperatively creating event listeners is just really
    really ugly and feels wrong


```ts
import html from "adhdsl";
import { using, on, subjective, subject } from "adhdsl";

const app = () => {
  // "subject" is the atomic unit of state in adhtml, it is used
  // for fine grained reactivity.
  const counter = subject(0);

  // using(subject, callback) is used for dom nodes that respond to subjects
  const countMessage = using(
    counter,
    (count: number) => `Clicked ${count} times`,
  );
  const incrementCount = () => counter.set((v) => v + 1);

  const buttonColour = subject("blue");
  const buttonStyle = using(
    buttonColour,
    (colour: string) => `color:white;background-color:${colour};padding:10px`,
  );

  // we can interpolate attributes that respond to subjects using `subjective({attributeName: subject or using(subject, callback)})`
  // and interpolate event listeners using `on({eventName: (event) => void})`
  const incrementButton = html`
    <button
      ${subjective({ style: buttonStyle })}
      ${on({ click: incrementCount })}
    >
      ${countMessage}
    </button>
  `;

  const switchButtonColour = () =>
    buttonColour.set((current) => (current === "red" ? "blue" : "red"));

  const switchColourButton = html`
    <button ${on({ click: switchButtonColour })}>Change Button Colour</button>
  `;

  // we can even interpolate entire elements without losing event listeners
  // or subscriptions

  return html`
    <div>
      <h1>stupid counter</h1>
      ${incrementButton}
      <br />
      ${switchColourButton}
    </div>
  `;
};

document.body.appendChild(app());

```
