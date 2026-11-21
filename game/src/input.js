// Keyboard input: a live set of held keys plus edge-triggered actions (E, F, J,
// Enter, Escape) that fire once per press, so the world never sees a held key as
// a repeated action.
export const ACTION_ENTER_CAR = 'enterCar';
export const ACTION_PUNCH = 'punch';
export const ACTION_DISPATCH = 'dispatch';
export const ACTION_CONFIRM = 'confirm';
export const ACTION_PAUSE = 'pause';
export const ACTION_MUTE = 'mute';

const KEY_ACTIONS = {
  KeyE: ACTION_ENTER_CAR,
  KeyF: ACTION_PUNCH,
  KeyJ: ACTION_DISPATCH,
  Enter: ACTION_CONFIRM,
  Space: ACTION_CONFIRM,
  Escape: ACTION_PAUSE,
  KeyP: ACTION_PAUSE,
  KeyM: ACTION_MUTE,
};

export function createInput(target) {
  const held = new Set();
  const pressed = new Set();
  let attached = true;

  function onKeyDown(event) {
    if (event.repeat) return;
    held.add(event.code);
    const action = KEY_ACTIONS[event.code];
    if (action) pressed.add(action);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
      event.preventDefault();
    }
  }
  function onKeyUp(event) {
    held.delete(event.code);
  }
  function onBlur() {
    held.clear();
  }
  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);
  target.addEventListener('blur', onBlur);

  return {
    held,
    /** True while any of the given key codes is held down. */
    isDown(...codes) {
      return codes.some((code) => held.has(code));
    },
    /** Edge-triggered actions pressed since the last read; reading clears them. */
    takePressed() {
      const out = new Set(pressed);
      pressed.clear();
      return out;
    },
    /** Test and shot drivers inject a synthetic action without a real key. */
    injectAction(action) {
      pressed.add(action);
    },
    /** Test and shot drivers inject held keys without a real keyboard. */
    injectHeld(code, down) {
      if (down) held.add(code);
      else held.delete(code);
    },
    detach() {
      if (!attached) return;
      attached = false;
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('keyup', onKeyUp);
      target.removeEventListener('blur', onBlur);
    },
  };
}
