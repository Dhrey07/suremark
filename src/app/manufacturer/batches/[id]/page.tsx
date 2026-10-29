import { redirect } from "next/navigation";
export default async function ManufacturerBatchAlias({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; redirect(`/app/batches/${id}`); }
