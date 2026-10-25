import QRCode from "qrcode";
import { formatCode } from "@/lib/codes";
import { USSD_SERVICE_CODE } from "@/lib/ussd";

export async function qrSvg(text: string) {
  return QRCode.toString(text, { type: "svg", errorCorrectionLevel: "M", margin: 0 });
}

/** Printed pack label: QR credential plus the 16-digit fallback code. */
export async function PackLabel(props: {
  url: string;
  code: string;
  index: number;
  manufacturerAlias: string;
  productAlias: string;
  productName: string;
  lot: string;
  expiry: string;
  state: string;
}) {
  const svg = await qrSvg(props.url);
  const retired = props.state === "REJECTED" || props.state === "VOIDED";
  return (
    <div data-url={props.url} className={`relative break-inside-avoid rounded-md border border-slate-300 bg-white p-2.5 ${retired ? "opacity-40" : ""}`}>
      <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        <span>
          {props.manufacturerAlias} / {props.productAlias}
        </span>
        <span className="tabular">#{props.index}</span>
      </div>
      <div className="mx-auto mt-1.5 w-28 [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="mt-1.5 text-center font-mono text-[11px] font-semibold tracking-wider text-slate-900">{formatCode(props.code)}</div>
      <div className="mt-0.5 truncate text-center text-[10px] text-slate-600">{props.productName}</div>
      <div className="text-center text-[10px] text-slate-500">
        Lot {props.lot} · Exp {props.expiry}
      </div>
      <div className="text-center text-[9px] text-slate-400">Scan or dial {USSD_SERVICE_CODE}</div>
      {retired && <div className="absolute inset-0 flex items-center justify-center text-sm font-bold uppercase text-red-700">{props.state}</div>}
    </div>
  );
}
