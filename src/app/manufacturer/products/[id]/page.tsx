import { redirect } from "next/navigation";
export default async function ManufacturerProductAlias({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; redirect(`/app/products/${id}`); }
