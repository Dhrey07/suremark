import { redirect } from "next/navigation";
import { Shell } from "@/components/shell";
import { canPlatform } from "@/lib/authz";
import { requireActor } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor("/platform/login");
  if (!canPlatform(actor, "manufacturers:review")) redirect(actor.domain === "regulator" ? "/regulator" : "/app");
  return (
    <Shell actor={actor} items={[{ href: "/platform", label: "Network overview", section: "Trust network" }]} context="Platform operations">
      {children}
    </Shell>
  );
}
