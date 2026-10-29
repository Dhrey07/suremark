import { NextResponse } from "next/server";
import { DomainError } from "@/lib/errors";
import { buildPrintReadyPdf } from "@/lib/pdf-labels";
import { publicBaseUrl } from "@/lib/request-context";
import { requireActor } from "@/lib/session";
import { buildBatchCsv, completeBatchExport, prepareBatchExport, type BatchExportType } from "@/lib/services/exports";

function ids(value: string | null) {
  if (!value) return undefined;
  const parsed = value.split(",").filter((id) => /^[0-9a-f-]{36}$/.test(id));
  return parsed.length ? parsed : undefined;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [{ id }, actor] = await Promise.all([params, requireActor()]);
    const url = new URL(request.url);
    const format = url.searchParams.get("format") ?? "csv";
    if (!["csv", "units", "cartons", "summary"].includes(format)) return NextResponse.json({ error: "invalid_format" }, { status: 422 });
    const type: BatchExportType = format === "csv" ? "csv" : format === "units" ? "unit_labels_pdf" : format === "cartons" ? "carton_labels_pdf" : "batch_summary_pdf";
    const data = await prepareBatchExport(actor, id, type, { unitIds: ids(url.searchParams.get("unitIds")), cartonIds: ids(url.searchParams.get("cartonIds")) });
    const baseUrl = await publicBaseUrl();
    const content = format === "csv" ? buildBatchCsv(data, baseUrl) : buildPrintReadyPdf(data, format as "units" | "cartons" | "summary", baseUrl);
    const recordCount = format === "cartons" ? data.cartons.length : format === "summary" ? 1 : data.units.length;
    await completeBatchExport(actor, data.exportJobId, content, recordCount);
    const extension = format === "csv" ? "csv" : "pdf";
    const label = format === "csv" ? "unit-codes" : format === "units" ? "unit-labels" : format === "cartons" ? "carton-labels" : "batch-summary";
    return new NextResponse(new Uint8Array(content), {
      headers: {
        "content-type": format === "csv" ? "text/csv; charset=utf-8" : "application/pdf",
        "content-disposition": `attachment; filename="${data.batch.lot}-${label}.${extension}"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof DomainError) return NextResponse.json({ error: error.code, message: error.message }, { status: error.code === "forbidden" ? 403 : error.code === "not_found" ? 404 : 422 });
    console.error(error);
    return NextResponse.json({ error: "export_failed" }, { status: 500 });
  }
}
