import "server-only";

import QRCode from "qrcode";
import type { prepareBatchExport } from "@/lib/services/exports";

type ExportData = Awaited<ReturnType<typeof prepareBatchExport>>;
type Page = string;

const esc = (value: unknown) => String(value ?? "").replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
const text = (x: number, y: number, size: number, value: unknown, font = "F1") => `BT /${font} ${size} Tf ${x} ${y} Td (${esc(value)}) Tj ET\n`;

function qrCommands(value: string, x: number, y: number, size: number) {
  const modules = QRCode.create(value, { errorCorrectionLevel: "M" }).modules;
  const cell = size / modules.size;
  let out = "0 0 0 rg\n";
  for (let row = 0; row < modules.size; row++) for (let col = 0; col < modules.size; col++) if (modules.get(row, col)) out += `${(x + col * cell).toFixed(2)} ${(y + (modules.size - row - 1) * cell).toFixed(2)} ${cell.toFixed(2)} ${cell.toFixed(2)} re f\n`;
  return out;
}

function makePdf(pages: Page[]) {
  const objects: string[] = [];
  const add = (body: string) => { objects.push(body); return objects.length; };
  const fontRegular = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const fontBold = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  const pagesId = add("");
  const pageIds: number[] = [];
  for (const content of pages) {
    const streamId = add(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}endstream`);
    const pageId = add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> >> /Contents ${streamId} 0 R >>`);
    pageIds.push(pageId);
  }
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  const catalogId = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  let pdf = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets = [0];
  objects.forEach((body, i) => { offsets.push(Buffer.byteLength(pdf, "binary")); pdf += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf, "binary");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "binary");
}

function unitPages(data: ExportData, baseUrl: string) {
  const pages: string[] = [];
  const perPage = 12;
  for (let start = 0; start < data.units.length; start += perPage) {
    let page = "1 1 1 rg 0 0 595 842 re f\n";
    data.units.slice(start, start + perPage).forEach((unit, index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      const x = 18 + col * 192;
      const y = 842 - 18 - (row + 1) * 198;
      page += `0.84 0.84 0.81 RG 0.6 w ${x} ${y} 180 186 re S\n`;
      page += text(x + 9, y + 168, 8, `${data.manufacturer.alias} / ${data.product.alias}`, "F2");
      page += text(x + 144, y + 168, 8, `#${unit.labelIndex}`, "F2");
      page += qrCommands(`${baseUrl}/v/${unit.payload}`, x + 49, y + 65, 82);
      page += text(x + 28, y + 52, 10, unit.code.replace(/(.{4})/g, "$1 ").trim(), "F2");
      page += text(x + 9, y + 36, 8, data.product.name);
      page += text(x + 9, y + 23, 7, `Batch ${data.batch.lot}`);
      page += text(x + 9, y + 11, 7, `${unit.cartonCode ? `Carton ${unit.cartonCode}` : "Loose unit"} · Exp ${data.batch.expiryDate}`);
    });
    pages.push(page);
  }
  return pages;
}

function cartonPages(data: ExportData) {
  const pages: string[] = [];
  for (let start = 0; start < data.cartons.length; start += 6) {
    let page = "1 1 1 rg 0 0 595 842 re f\n";
    data.cartons.slice(start, start + 6).forEach((carton, index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      const x = 24 + col * 280;
      const y = 842 - 24 - (row + 1) * 258;
      page += `0.78 0.82 0.76 RG 0.8 w ${x} ${y} 260 238 re S\n`;
      page += text(x + 14, y + 214, 12, data.product.name, "F2");
      page += text(x + 14, y + 196, 9, `Batch ${data.batch.lot}`);
      page += qrCommands(`carton:${carton.cuisCredential ?? carton.credential}`, x + 79, y + 70, 102);
      page += text(x + 14, y + 48, 11, carton.code, "F2");
      page += text(x + 14, y + 31, 9, `Quantity ${carton.expectedUnits} units`);
      page += text(x + 14, y + 16, 8, `${data.factory.name} · ${data.line.name}`);
    });
    pages.push(page);
  }
  return pages;
}

function summaryPage(data: ExportData) {
  let page = "1 1 1 rg 0 0 595 842 re f\n";
  page += "0.06 0.15 0.12 rg 0 700 595 142 re f\n";
  page += "1 1 1 rg\n" + text(42, 785, 12, "SUREMARK PRODUCTION RECORD", "F2") + text(42, 746, 25, data.batch.lot, "F2") + text(42, 720, 11, `${data.product.name} · ${data.product.alias}`);
  page += "0.05 0.07 0.06 rg\n";
  const lines = [
    ["Manufacturer", data.manufacturer.legalName], ["Manufacturer prefix", data.manufacturer.alias], ["Product", data.product.name], ["Product code", data.product.alias], ["CUIS batch identity", data.batch.cuisCredential ? `v${data.batch.cuisVersion} / key ${data.batch.cuisKeyVersion}` : "Legacy"], ["Manufactured", data.batch.manufactureDate], ["Expires", data.batch.expiryDate], ["Factory", data.factory.name], ["Production line", data.line.name], ["Cartons", data.batch.cartonCount ?? 0], ["Units per carton", data.batch.unitsPerCarton ?? 0], ["Loose units", data.batch.looseUnits], ["Total identities", data.units.length], ["Created by", `${data.batch.createdByRole} — ${data.batch.createdByName}`], ["Created", data.batch.createdAt.toISOString()], ["Status", data.batch.status],
  ];
  lines.forEach(([label, value], index) => { const y = 660 - index * 34; page += text(44, y, 8, String(label).toUpperCase(), "F2") + text(210, y, 10, value); });
  return [page];
}

export function buildPrintReadyPdf(data: ExportData, kind: "units" | "cartons" | "summary", baseUrl: string) {
  const pages = kind === "units" ? unitPages(data, baseUrl) : kind === "cartons" ? cartonPages(data) : summaryPage(data);
  return makePdf(pages.length ? pages : summaryPage(data));
}
