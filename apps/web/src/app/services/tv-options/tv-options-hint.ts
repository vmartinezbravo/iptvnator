import { findTvActions } from './tv-options-keys';

/**
 * On the TV shell, a small hint in a corner while the focused element has
 * options (`findTvActions`), so the Menu key and the long OK are
 * discoverable. `label` gives the translated text when it shows.
 */
export function startTvOptionsHint(
    label: () => string,
    doc: Document = document
): () => void {
    const hint = doc.createElement('div');
    hint.className = 'tv-options-hint';
    hint.hidden = true;
    doc.body.appendChild(hint);

    const update = () => {
        const visible = findTvActions(doc.activeElement).length > 0;
        if (visible) hint.textContent = label();
        hint.hidden = !visible;
    };

    doc.addEventListener('focusin', update);
    return () => {
        doc.removeEventListener('focusin', update);
        hint.remove();
    };
}
