import { AppShell } from "@/components/shell/AppShell";
import type { ReactNode } from "react";

export default function DossierLayout({ children }: { children: ReactNode }) {
  return <AppShell variant="minimal">{children}</AppShell>;
}
