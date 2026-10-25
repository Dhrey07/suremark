"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { attempt, str, type ActionState } from "@/lib/action";
import { authorizePlatform } from "@/lib/authz";
import { env } from "@/lib/env";
import { forbidden } from "@/lib/errors";
import { resetDatabase, seedDemo } from "@/lib/seed";
import { requireActor } from "@/lib/session";
import { reviewManufacturer, reviewProduct } from "@/lib/services/catalog";

export async function reviewManufacturerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  return attempt(async () => {
    const approve = str(fd, "decision") === "approve";
    await reviewManufacturer(actor, str(fd, "manufacturerId"), approve);
    revalidatePath("/platform");
    return { ok: true, message: approve ? "Manufacturer approved. Its members can now sign in to the portal." : "Application rejected." };
  });
}

export async function reviewProductAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  return attempt(async () => {
    const approve = str(fd, "decision") === "approve";
    await reviewProduct(actor, str(fd, "productId"), approve);
    revalidatePath("/platform");
    return { ok: true, message: approve ? "Product approved for issuance." : "Product rejected." };
  });
}

export async function resetDemoAction(_: ActionState): Promise<ActionState> {
  const actor = await requireActor();
  const res = await attempt(async () => {
    if (!env.demoMode) throw forbidden("Demo reset is disabled.");
    await authorizePlatform(actor, "demo:reset");
    await resetDatabase();
    await seedDemo(env.demoPassword);
  });
  if (res.error) return res;
  redirect("/login");
}
