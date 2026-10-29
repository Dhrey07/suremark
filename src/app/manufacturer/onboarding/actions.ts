"use server";

import { attempt, str, type ActionState } from "@/lib/action";
import { invalid } from "@/lib/errors";
import { submitManufacturerApplication } from "@/lib/services/onboarding";

export async function submitManufacturerApplicationAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return attempt(async () => {
    const password = str(formData, "password");
    if (password !== str(formData, "passwordConfirmation")) throw invalid("Passwords do not match.");
    await submitManufacturerApplication({
      legalName: str(formData, "legalName"),
      rcNumber: str(formData, "rcNumber"),
      sector: str(formData, "sector"),
      hqState: str(formData, "hqState"),
      ownerName: str(formData, "ownerName"),
      ownerTitle: str(formData, "ownerTitle"),
      ownerEmail: str(formData, "ownerEmail"),
      password,
    });
    return { ok: true, message: "Application saved. The platform team can now review your organization." };
  });
}
