/**
 * D-pad cursor: the arrow keys move a highlight through whatever is on the screen,
 * OK activates it. Works on every screen by reading the live DOM of the view.
 */

const ITEM_SELECTOR = [
    'button',
    'input:not([type="hidden"])',
    'textarea',
    'select',
    'a[href]',
    '[tabindex]:not([tabindex="-1"])',
].join(', ');

const CURSOR = 'pp-cursor';

/** @param {Element} el */
function isTextField(el) {
    if (el instanceof HTMLTextAreaElement) {
        return true;
    }
    if (!(el instanceof HTMLInputElement)) {
        return false;
    }
    return ['text', 'search', 'email', 'url', 'tel', 'password', 'number', ''].includes(el.type)
        || !el.getAttribute('type');
}

/** @param {Element} el */
function isUsable(el) {
    if (/** @type {HTMLButtonElement} */ (el).disabled || el.closest('[hidden], [aria-hidden="true"]')) {
        return false;
    }
    if (!el.getClientRects().length) {
        return false;
    }
    const style = getComputedStyle(el);
    return style.visibility !== 'hidden' && style.pointerEvents !== 'none';
}

/**
 * @param {{ getView: () => HTMLElement | null, onField?: (el: HTMLInputElement | HTMLTextAreaElement) => void }} opts
 */
export function createNavCursor(opts) {
    /** @type {HTMLElement | null} */
    let current = null;

    const items = () => {
        const view = opts.getView();
        if (!view) {
            return [];
        }
        return /** @type {HTMLElement[]} */ ([...view.querySelectorAll(ITEM_SELECTOR)].filter(isUsable));
    };

    /** The highlighted element, if it survived the last render. */
    const live = () => {
        const view = opts.getView();
        if (current && (!view || !view.contains(current) || !isUsable(current))) {
            current.classList.remove(CURSOR);
            current = null;
        }
        return current;
    };

    /** @param {HTMLElement} el */
    const set = (el) => {
        current?.classList.remove(CURSOR);
        current = el;
        el.classList.add(CURSOR);
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        if (isTextField(el)) {
            opts.onField?.(/** @type {HTMLInputElement | HTMLTextAreaElement} */ (el));
        }
    };

    /** @param {1 | -1} step */
    const step = (step) => {
        const list = items();
        if (!list.length) {
            return;
        }
        const at = live() ? list.indexOf(/** @type {HTMLElement} */ (current)) : -1;
        if (at < 0) {
            // Start from what is showing: the first visible item going down, the last going up.
            const box = opts.getView()?.getBoundingClientRect();
            const inView = box ? list.filter((el) => {
                const r = el.getBoundingClientRect();
                return r.bottom > box.top && r.top < box.bottom;
            }) : [];
            const pool = inView.length ? inView : list;
            set(step > 0 ? pool[0] : pool[pool.length - 1]);
            return;
        }
        set(list[(at + step + list.length) % list.length]);
    };

    /** @param {HTMLSelectElement} sel @param {1 | -1} dir */
    const cycleSelect = (sel, dir) => {
        const n = sel.options.length;
        if (!n) {
            return;
        }
        let i = sel.selectedIndex;
        for (let tries = 0; tries < n; tries++) {
            i = (i + dir + n) % n;
            if (!sel.options[i].disabled) {
                break;
            }
        }
        sel.selectedIndex = i;
        sel.dispatchEvent(new Event('input', { bubbles: true }));
        sel.dispatchEvent(new Event('change', { bubbles: true }));
    };

    return {
        /** @param {string} dir up | down | left | right */
        move(dir) {
            const el = live();
            const sign = dir === 'up' || dir === 'left' ? -1 : 1;
            if (el && (dir === 'left' || dir === 'right')) {
                if (isTextField(el) && document.activeElement === el) {
                    const field = /** @type {HTMLInputElement | HTMLTextAreaElement} */ (el);
                    try {
                        const pos = Math.max(0, Math.min(field.value.length, (field.selectionStart ?? field.value.length) + sign));
                        field.setSelectionRange(pos, pos);
                        return;
                    } catch {
                        /* number inputs have no caret: fall through to stepping */
                    }
                }
                if (el instanceof HTMLSelectElement) {
                    cycleSelect(el, sign);
                    return;
                }
                if (el instanceof HTMLInputElement && el.type === 'range') {
                    if (sign > 0) {
                        el.stepUp();
                    } else {
                        el.stepDown();
                    }
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    return;
                }
            }
            step(sign);
        },

        /** OK: press the highlighted control. */
        activate() {
            const el = live();
            if (!el) {
                return;
            }
            if (isTextField(el)) {
                el.focus();
            } else if (el instanceof HTMLSelectElement) {
                cycleSelect(el, 1);
            } else {
                el.click();
            }
        },

        clear() {
            current?.classList.remove(CURSOR);
            current = null;
        },

        /** Put the highlight on a specific control (e.g. a menu's remembered cell). */
        highlight(el) {
            if (el) {
                set(el);
            }
        },

        /** The highlighted control, if any. */
        current() {
            return live();
        },
    };
}
