import { redirect } from "next/navigation";

export default async function VerificationReference({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  redirect(`/v/${encodeURIComponent(reference)}`);
}
