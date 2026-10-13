import {
    NavigationCancel,
    NavigationEnd,
    NavigationError,
    Event as RouterEvent,
} from '@angular/router';
import { Observable } from 'rxjs';

export interface SectionSwitchBarOptions {
    navigate: (url: string) => unknown;
    events: Observable<RouterEvent>;
    /** Runs `run` once the current frame has been painted. */
    afterPaint?: (run: () => void) => void;
}

const SWITCHING_CLASS = 'section-switching';

const nextPaint = (run: () => void) =>
    requestAnimationFrame(() => setTimeout(run));

/**
 * On the TV shell, opening a section from the side menu blocks the page for
 * 0.6-1.6 s, so nothing drawn from script would show until it ends. A click
 * on a side-menu link therefore shows a thin bar first, animated by CSS on
 * the compositor (`.section-switch-bar` in styles.scss), and opens the
 * section one painted frame later. The bar goes once the new section has
 * rendered; sections that are still loading show their own skeletons.
 */
export function startSectionSwitchBar(
    options: SectionSwitchBarOptions,
    doc: Document = document
): () => void {
    const afterPaint = options.afterPaint ?? nextPaint;
    const root = doc.documentElement;
    const bar = doc.createElement('div');
    bar.className = 'section-switch-bar';
    bar.setAttribute('aria-hidden', 'true');
    doc.body.appendChild(bar);
    let pending = false;

    const onClick = (event: MouseEvent) => {
        if (
            event.defaultPrevented ||
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
        ) {
            return;
        }
        const link = (event.target as Element | null)?.closest?.(
            'a.portal-rail-link[href]'
        ) as HTMLAnchorElement | null;
        if (!link) return;
        const target = new URL(link.href, doc.baseURI);
        const url = target.pathname + target.search + target.hash;
        const current = doc.location;
        if (url === current.pathname + current.search + current.hash) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        pending = true;
        root.classList.add(SWITCHING_CLASS);
        afterPaint(() => options.navigate(url));
    };

    const subscription = options.events.subscribe((routerEvent) => {
        if (
            pending &&
            (routerEvent instanceof NavigationEnd ||
                routerEvent instanceof NavigationCancel ||
                routerEvent instanceof NavigationError)
        ) {
            pending = false;
            afterPaint(() => root.classList.remove(SWITCHING_CLASS));
        }
    });

    doc.addEventListener('click', onClick, true);
    return () => {
        doc.removeEventListener('click', onClick, true);
        subscription.unsubscribe();
        bar.remove();
        root.classList.remove(SWITCHING_CLASS);
    };
}
