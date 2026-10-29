import { redirect } from "next/navigation";
import { getActor } from "@/lib/session";

export default async function ManufacturerDashboardEntry() {
  const actor = await getActor();
  if (!actor) redirect("/manufacturer/login");
  if (actor.domain !== "manufacturer") redirect(actor.domain === "platform" ? "/platform/dashboard" : "/regulator");
  redirect("/app");
}
