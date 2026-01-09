import { LitElement, html, css } from 'lit'
import { customElement, property } from 'lit/decorators.js'

@customElement('option-button')
export class OptionButton extends LitElement {
  static styles = css`
    :host {
      display: block;
      width: 100%;
    }
    button {
      width: 100%;
      padding: 1rem;
      font-size: 0.9rem;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.9);
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 0.5rem;
      cursor: pointer;
      transition: all 0.2s ease;
      text-align: left;
    }
    button:hover {
      background: rgba(255, 255, 255, 0.1);
      border-color: rgba(255, 255, 255, 0.3);
      transform: translateX(4px);
    }
    button:active {
      transform: translateX(2px);
    }
    button.correct {
      background: rgba(16, 185, 129, 0.2);
      border-color: rgba(16, 185, 129, 0.5);
      color: #6ee7b7;
    }
    button.wrong {
      background: rgba(239, 68, 68, 0.2);
      border-color: rgba(239, 68, 68, 0.5);
      color: #fca5a5;
    }
    button.default {
        opacity: 1;
    }
  `

  @property({ type: String }) label = ''
  @property({ type: String }) value = ''
  @property({ type: String }) state = 'default' // default, correct, wrong

  render() {
    return html`
      <button class="${this.state}">
        ${this.label}
      </button>
    `
  }
}

export default OptionButton
