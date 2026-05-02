import type { DetailedHTMLProps, HTMLAttributes } from "react";

declare module "react" {
    namespace JSX {
        interface IntrinsicElements {
            "sdpi-heading": DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>;
            "sdpi-item": DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
                label?: string;
            };
            "sdpi-color": DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
                setting?: string;
                default?: string;
                value?: string;
            };
        }
    }
}
