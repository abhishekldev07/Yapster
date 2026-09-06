/* Small DOM-level chat interaction helpers.
   Kept outside MessagesPage so keyboard behavior stays consistent across mobile browsers. */

const COMPOSER_SELECTOR = "textarea.yapster-message-composer";
const EMOJI_BUTTON_SELECTOR = 'button[aria-label="Add emoji"]';

const getComposerFromElement = (element: Element | null): HTMLTextAreaElement | null => {
  if (!element) return null;
  const form = element.closest("form.yapster-message-composer-shell");
  return form?.querySelector<HTMLTextAreaElement>(COMPOSER_SELECTOR) ?? null;
};

const isComposerEmojiControl = (element: Element | null) => {
  const button = element?.closest("button");
  if (!button) return false;
  if (button.matches(EMOJI_BUTTON_SELECTOR)) return true;
  const popover = button.closest("[data-chat-popover]");
  return Boolean(popover?.querySelector(EMOJI_BUTTON_SELECTOR));
};

const submitComposer = (composer: HTMLTextAreaElement) => {
  const form = composer.closest<HTMLFormElement>("form.yapster-message-composer-shell");
  if (!form || !composer.value.trim()) return;
  const submitButton = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (!submitButton || submitButton.disabled) return;
  form.requestSubmit(submitButton);
};

/* Enter sends. Shift+Enter intentionally remains available for a manual line break. */
document.addEventListener("keydown", (event) => {
  if (!(event.target instanceof HTMLTextAreaElement) || !event.target.matches(COMPOSER_SELECTOR)) return;
  if (event.key !== "Enter" || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return;

  event.preventDefault();
  submitComposer(event.target);
}, true);

/* Give mobile software keyboards the correct action label where supported. */
document.addEventListener("focusin", (event) => {
  if (event.target instanceof HTMLTextAreaElement && event.target.matches(COMPOSER_SELECTOR)) {
    event.target.setAttribute("enterkeyhint", "send");
  }
});

/* Clicking the emoji button or an emoji must not steal focus from the composer.
   Preventing pointer/mouse focus keeps software keyboards open while preserving the button click. */
const preserveComposerFocus = (event: Event) => {
  if (!(event.target instanceof Element) || !isComposerEmojiControl(event.target)) return;
  const composer = getComposerFromElement(event.target);
  if (composer && document.activeElement === composer) event.preventDefault();
};

document.addEventListener("pointerdown", preserveComposerFocus, true);
document.addEventListener("mousedown", preserveComposerFocus, true);

document.addEventListener("click", (event) => {
  if (!(event.target instanceof Element) || !isComposerEmojiControl(event.target)) return;
  const composer = getComposerFromElement(event.target);
  if (!composer) return;

  window.requestAnimationFrame(() => {
    try {
      composer.focus({ preventScroll: true });
    } catch {
      composer.focus();
    }
  });
}, true);

/* visualViewport is the reliable way to distinguish the usable phone viewport from the area
   covered by the software keyboard. CSS uses this class/variable to hide bottom navigation and
   let the conversation fill the remaining space instead of leaving a large dead zone. */
const visualViewport = window.visualViewport;
let stableViewportHeight = visualViewport?.height ?? window.innerHeight;
let stableViewportWidth = visualViewport?.width ?? window.innerWidth;

const updateKeyboardState = () => {
  const currentHeight = visualViewport?.height ?? window.innerHeight;
  const currentWidth = visualViewport?.width ?? window.innerWidth;
  const activeComposer = document.activeElement instanceof HTMLTextAreaElement && document.activeElement.matches(COMPOSER_SELECTOR);

  if (!activeComposer) {
    if (Math.abs(currentWidth - stableViewportWidth) > 48) {
      stableViewportHeight = currentHeight;
      stableViewportWidth = currentWidth;
    } else {
      stableViewportHeight = Math.max(stableViewportHeight, currentHeight);
    }
  }

  const keyboardOpen = activeComposer && stableViewportHeight - currentHeight > 110;
  document.documentElement.style.setProperty("--yapster-visual-height", `${Math.round(currentHeight)}px`);
  document.documentElement.classList.toggle("yapster-keyboard-open", keyboardOpen);
};

visualViewport?.addEventListener("resize", updateKeyboardState);
visualViewport?.addEventListener("scroll", updateKeyboardState);
window.addEventListener("orientationchange", () => {
  window.setTimeout(() => {
    stableViewportHeight = visualViewport?.height ?? window.innerHeight;
    stableViewportWidth = visualViewport?.width ?? window.innerWidth;
    updateKeyboardState();
  }, 180);
});
document.addEventListener("focusin", () => window.requestAnimationFrame(updateKeyboardState));
document.addEventListener("focusout", () => window.setTimeout(updateKeyboardState, 0));

updateKeyboardState();
