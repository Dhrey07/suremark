import { redirect } from "next/navigation";
import { Shell } from "@/components/shell";
import { canPlatform } from "@/lib/authz";
import { requireActor } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function RegulatorLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();
  if (!canPlatform(actor, "regulator:read")) redirect(actor.domain === "platform" ? "/platform" : "/app");
  return (
    <Shell actor={actor} items={[{ href: "/regulator", label: "National overview", section: "Surveillance" }]} context="Regulator view · read-only">
      {children}
    </Shell>
  );
}
