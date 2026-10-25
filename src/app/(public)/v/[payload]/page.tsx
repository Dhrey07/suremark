import type { Metadata } from "next";
import { DemoRegion } from "@/components/demo-region";
import { env } from "@/lib/env";
import { demoRegion } from "@/lib/request-context";
import { QrCheck } from "./qr-check";

export const metadata: Metadata = { title: "Checking product", robots: { index: false, follow: false } };

export default async function QrLanding({ params }: { params: Promise<{ payload: string }> }) {
  const { payload } = await params;
  const region = await demoRegion();
  return (
    <div className="mx-auto max-w-md space-y-4 px-4 py-8">
      <QrCheck payload={payload} />
      {env.demoMode && <DemoRegion current={region} />}
    </div>
  );
}
