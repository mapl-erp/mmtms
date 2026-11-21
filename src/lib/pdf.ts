import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { inr, num } from "./format";

type LrTrip = {
  number: string;
  lrNumber: string | null;
  origin: string;
  destination: string;
  goods: string;
  weightTons: { toString(): string };
  freight: { toString(): string };
  sealNumber: string | null;
  createdAt: Date;
  truck: { regNo: string; make: string };
  driver: { name: string };
  consignor: { name: string; city: string | null } | null;
  consignee: { name: string; city: string | null } | null;
  customer: { name: string } | null;
};

export async function renderLr(trip: LrTrip): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const serif = await doc.embedFont(StandardFonts.TimesRoman);
  const serifBold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const sans = await doc.embedFont(StandardFonts.Helvetica);
  const ink = rgb(0.11, 0.09, 0.07);
  const pine = rgb(0.11, 0.23, 0.2);
  const muted = rgb(0.36, 0.33, 0.28);
  page.drawRectangle({ x: 0, y: 780, width: 595, height: 62, color: pine });
  page.drawText("MIGHTY MOVERS", { x: 40, y: 808, size: 18, font: serifBold, color: rgb(0.96, 0.93, 0.87) });
  page.drawText("Lorry receipt / bilty", { x: 40, y: 790, size: 11, font: sans, color: rgb(0.9, 0.78, 0.55) });
  page.drawText(trip.lrNumber ?? "LR pending", {
    x: 400,
    y: 804,
    size: 14,
    font: serifBold,
    color: rgb(0.96, 0.93, 0.87),
  });
  const rows: [string, string][] = [
    ["Trip", trip.number],
    ["Date", trip.createdAt.toISOString().slice(0, 10)],
    ["From", trip.origin],
    ["To", trip.destination],
    ["Truck", `${trip.truck.regNo} · ${trip.truck.make}`],
    ["Driver", trip.driver.name],
    ["Consignor", trip.consignor ? `${trip.consignor.name}${trip.consignor.city ? `, ${trip.consignor.city}` : ""}` : "—"],
    ["Consignee", trip.consignee ? `${trip.consignee.name}${trip.consignee.city ? `, ${trip.consignee.city}` : ""}` : "—"],
    ["Customer", trip.customer?.name ?? "—"],
    ["Goods", trip.goods],
    ["Weight", `${num(trip.weightTons).toFixed(2)} tonne`],
    ["Freight", inr(num(trip.freight))],
    ["Seal", trip.sealNumber ?? "—"],
  ];
  let y = 740;
  for (const [label, value] of rows) {
    page.drawText(label, { x: 40, y, size: 11, font: sans, color: muted });
    page.drawText(value, { x: 160, y, size: 12, font: serif, color: ink });
    y -= 28;
  }
  page.drawText("This lorry receipt is not a tax invoice. GST is billed separately.", {
    x: 40,
    y: 120,
    size: 10,
    font: sans,
    color: muted,
  });
  page.drawText("Consignor signature", { x: 40, y: 70, size: 10, font: sans, color: muted });
  page.drawText("Driver signature", { x: 230, y: 70, size: 10, font: sans, color: muted });
  page.drawText("Consignee signature", { x: 400, y: 70, size: 10, font: sans, color: muted });
  page.drawLine({ start: { x: 40, y: 88 }, end: { x: 180, y: 88 }, thickness: 0.6, color: ink });
  page.drawLine({ start: { x: 230, y: 88 }, end: { x: 370, y: 88 }, thickness: 0.6, color: ink });
  page.drawLine({ start: { x: 400, y: 88 }, end: { x: 540, y: 88 }, thickness: 0.6, color: ink });
  return doc.save();
}
