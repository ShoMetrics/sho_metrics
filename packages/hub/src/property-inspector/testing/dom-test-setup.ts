import { after, afterEach } from "node:test";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
    url: "http://localhost/property-inspector.html",
});

type DomGlobal = typeof globalThis & {
    cancelAnimationFrame: Window["cancelAnimationFrame"];
    document: Document;
    Element: typeof Element;
    Event: typeof Event;
    getComputedStyle: Window["getComputedStyle"];
    HTMLButtonElement: typeof HTMLButtonElement;
    HTMLDivElement: typeof HTMLDivElement;
    HTMLElement: typeof HTMLElement;
    HTMLImageElement: typeof HTMLImageElement;
    HTMLInputElement: typeof HTMLInputElement;
    HTMLLabelElement: typeof HTMLLabelElement;
    HTMLSelectElement: typeof HTMLSelectElement;
    HTMLTextAreaElement: typeof HTMLTextAreaElement;
    IS_REACT_ACT_ENVIRONMENT: boolean;
    KeyboardEvent: typeof KeyboardEvent;
    MouseEvent: typeof MouseEvent;
    MutationObserver: typeof MutationObserver;
    navigator: Navigator;
    Node: typeof Node;
    PointerEvent: typeof PointerEvent;
    requestAnimationFrame: Window["requestAnimationFrame"];
    SVGElement: typeof SVGElement;
    window: Window & typeof globalThis;
};

const testGlobal = globalThis as DomGlobal;
const requireFromSetup = createRequire(__filename);
const pointerEventConstructor = (dom.window.PointerEvent ?? dom.window.MouseEvent) as unknown as typeof PointerEvent;

defineGlobal("window", dom.window as unknown as Window & typeof globalThis);
defineGlobal("document", dom.window.document);
defineGlobal("navigator", dom.window.navigator);
defineGlobal("Element", dom.window.Element);
defineGlobal("HTMLElement", dom.window.HTMLElement);
defineGlobal("HTMLButtonElement", dom.window.HTMLButtonElement);
defineGlobal("HTMLDivElement", dom.window.HTMLDivElement);
defineGlobal("HTMLImageElement", dom.window.HTMLImageElement);
defineGlobal("HTMLInputElement", dom.window.HTMLInputElement);
defineGlobal("HTMLLabelElement", dom.window.HTMLLabelElement);
defineGlobal("HTMLSelectElement", dom.window.HTMLSelectElement);
defineGlobal("HTMLTextAreaElement", dom.window.HTMLTextAreaElement);
defineGlobal("SVGElement", dom.window.SVGElement);
defineGlobal("Node", dom.window.Node);
defineGlobal("Event", dom.window.Event);
defineGlobal("KeyboardEvent", dom.window.KeyboardEvent);
defineGlobal("MouseEvent", dom.window.MouseEvent);
defineGlobal("PointerEvent", pointerEventConstructor);
defineGlobal("MutationObserver", dom.window.MutationObserver);
defineGlobal("getComputedStyle", dom.window.getComputedStyle.bind(dom.window));
defineGlobal("requestAnimationFrame", dom.window.requestAnimationFrame.bind(dom.window));
defineGlobal("cancelAnimationFrame", dom.window.cancelAnimationFrame.bind(dom.window));
defineGlobal("IS_REACT_ACT_ENVIRONMENT", true);

const { cleanup } = requireFromSetup("@testing-library/react") as typeof import("@testing-library/react");

if (!dom.window.HTMLElement.prototype.scrollIntoView) {
    Object.defineProperty(dom.window.HTMLElement.prototype, "scrollIntoView", {
        configurable: true,
        value: () => {
            // jsdom has no layout engine; PI tests assert state/ARIA, not scroll position.
        },
    });
}

afterEach(() => {
    cleanup();
    testGlobal.document.body.replaceChildren();
});

after(() => {
    dom.window.close();
});

function defineGlobal<TKey extends keyof DomGlobal>(name: TKey, value: DomGlobal[TKey]): void {
    Object.defineProperty(testGlobal, name, {
        configurable: true,
        value,
        writable: true,
    });
}
