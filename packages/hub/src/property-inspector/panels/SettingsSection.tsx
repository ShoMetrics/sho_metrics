import type { ReactNode } from "react";
import { SectionHeading } from "../components/SectionHeading";

interface SettingsSectionProps {
    title: string;
    children: ReactNode;
}

export function SettingsSection({ title, children }: SettingsSectionProps): React.JSX.Element {
    return (
        <section className="settings-section">
            <SectionHeading text={title} variant="section" />
            {children}
        </section>
    );
}
