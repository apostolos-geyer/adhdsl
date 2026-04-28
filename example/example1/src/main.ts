import "./style.css";

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
      <ul>
        ${using(counter, (value) =>
    Array.from({ length: value }).map(
      (_, index) => html`<li>element ${index}</li>` as HTMLLIElement,
    ),
  )}
      </ul>
      ${switchColourButton}
    </div>
  `;
};

document.body.appendChild(app());
