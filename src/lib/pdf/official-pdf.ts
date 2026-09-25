import { jsPDF } from "jspdf";
import {
  APP_TAGLINE,
  COMPANY_NAME_AR,
  COMPANY_NAME_EN,
  LOGO_SRC,
} from "@/lib/branding";

export type PdfLineItem = {
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

export type OfficialPdfPayload = {
  title: string;
  reference: string;
  date: string;
  partyLabel: string;
  partyName: string;
  meta?: Array<{ label: string; value: string }>;
  items: PdfLineItem[];
  totalLabel?: string;
  totalAmount: number;
  notes?: string;
};

export type TransferPdfItem = {
  name: string;
  quantity: number;
  unitType: string;
  batch?: string;
  category?: string;
  date?: string;
  status?: string;
};

export type PdfSummaryCard = {
  labelEn: string;
  labelAr: string;
  value: string;
};

export type TransferPdfPayload = {
  title: string;
  titleAr?: string;
  reference: string;
  date: string;
  partyLabel: string;
  partyName: string;
  meta?: Array<{ label: string; value: string }>;
  items: TransferPdfItem[];
  notes?: string;
  summaryLines?: string[];
  summaryCards?: PdfSummaryCard[];
};

// ---------------------------------------------------------------------------
// Layout constants (mm, A4 portrait)
// ---------------------------------------------------------------------------
const MARGIN = 16;
const TEAL: [number, number, number] = [13, 148, 136];
const NAVY: [number, number, number] = [15, 23, 42];
const MUTED: [number, number, number] = [100, 116, 139];
const CONTENT_BOTTOM = 272;
const FONT_FAMILY = "Amiri";
const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;

// ---------------------------------------------------------------------------
// Asset loading
// ---------------------------------------------------------------------------
let fontCache: Promise<{ regular: string; bold: string } | null> | null = null;
let logoCache: Promise<string | null> | null = null;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function fetchBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}`);
  return arrayBufferToBase64(await res.arrayBuffer());
}

function loadArabicFonts() {
  if (!fontCache) {
    fontCache = Promise.all([
      fetchBase64("/fonts/Amiri-Regular.ttf"),
      fetchBase64("/fonts/Amiri-Bold.ttf"),
    ])
      .then(([regular, bold]) => ({ regular, bold }))
      .catch(() => {
        fontCache = null;
        return null;
      });
  }
  return fontCache;
}

function loadLogoDataUrl() {
  if (!logoCache) {
    logoCache = fetch(LOGO_SRC)
      .then(async (res) => {
        if (!res.ok) return null;
        return `data:image/png;base64,${arrayBufferToBase64(await res.arrayBuffer())}`;
      })
      .catch(() => null);
  }
  return logoCache;
}

type PdfContext = {
  doc: jsPDF;
  font: string;
  logo: string | null;
  pageWidth: number;
  pageHeight: number;
};

async function createDoc(): Promise<PdfContext> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const [fonts, logo] = await Promise.all([loadArabicFonts(), loadLogoDataUrl()]);

  let font = "helvetica";
  if (fonts) {
    doc.addFileToVFS("Amiri-Regular.ttf", fonts.regular);
    doc.addFont("Amiri-Regular.ttf", FONT_FAMILY, "normal");
    doc.addFileToVFS("Amiri-Bold.ttf", fonts.bold);
    doc.addFont("Amiri-Bold.ttf", FONT_FAMILY, "bold");
    font = FONT_FAMILY;
  }
  doc.setFont(font, "normal");

  return {
    doc,
    font,
    logo,
    pageWidth: doc.internal.pageSize.getWidth(),
    pageHeight: doc.internal.pageSize.getHeight(),
  };
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------
const hasArabic = (text: string) => ARABIC_RE.test(text);

/** Without an Arabic-capable font, drop Arabic glyphs instead of printing garbage. */
function safe(ctx: PdfContext, text: string): string {
  if (ctx.font === FONT_FAMILY || !hasArabic(text)) return text;
  return text.replace(new RegExp(ARABIC_RE.source, "g"), "").trim() || "-";
}

function setFont(
  ctx: PdfContext,
  style: "normal" | "bold",
  size: number,
  color: [number, number, number] | number = 0
) {
  ctx.doc.setFont(ctx.font, style);
  ctx.doc.setFontSize(size);
  if (typeof color === "number") ctx.doc.setTextColor(color);
  else ctx.doc.setTextColor(...color);
}

function fit(ctx: PdfContext, text: string, width: number): string {
  const value = safe(ctx, text);
  if (ctx.doc.getTextWidth(value) <= width) return value;
  let out = value;
  while (out.length > 1 && ctx.doc.getTextWidth(`${out}…`) > width) {
    out = out.slice(0, -1);
  }
  return `${out}…`;
}

/** Arabic cells align right, Latin/numeric cells align left. */
function cellText(
  ctx: PdfContext,
  text: string,
  x: number,
  width: number,
  y: number,
  align?: "left" | "right" | "center"
) {
  const value = fit(ctx, text, width - 3);
  const a = align ?? (hasArabic(value) ? "right" : "left");
  const tx = a === "right" ? x + width - 1.5 : a === "center" ? x + width / 2 : x + 1.5;
  ctx.doc.text(value, tx, y, { align: a });
}

// ---------------------------------------------------------------------------
// Shared blocks
// ---------------------------------------------------------------------------
function drawHeader(ctx: PdfContext, titleEn: string, titleAr?: string): number {
  const { doc, pageWidth } = ctx;
  let y = 12;

  if (ctx.logo) {
    try {
      doc.addImage(ctx.logo, "PNG", MARGIN, y, 22, 22);
    } catch {
      // ignore broken logo
    }
  }

  setFont(ctx, "bold", 15, NAVY);
  doc.text(COMPANY_NAME_EN, pageWidth - MARGIN, y + 7, { align: "right" });
  setFont(ctx, "bold", 13, TEAL);
  doc.text(safe(ctx, COMPANY_NAME_AR), pageWidth - MARGIN, y + 14, { align: "right" });
  setFont(ctx, "normal", 9, MUTED);
  doc.text(safe(ctx, APP_TAGLINE), pageWidth - MARGIN, y + 20, { align: "right" });

  y += 27;
  doc.setDrawColor(...TEAL);
  doc.setLineWidth(0.8);
  doc.line(MARGIN, y, pageWidth - MARGIN, y);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, y + 1.2, pageWidth - MARGIN, y + 1.2);
  y += 9;

  setFont(ctx, "bold", 14, NAVY);
  doc.text(safe(ctx, titleEn), MARGIN, y);
  if (titleAr) {
    setFont(ctx, "bold", 14, TEAL);
    doc.text(safe(ctx, titleAr), pageWidth - MARGIN, y, { align: "right" });
  }
  return y + 5;
}

function drawInfoGrid(
  ctx: PdfContext,
  rows: Array<{ label: string; value: string }>,
  y: number
): number {
  const { doc, pageWidth } = ctx;
  const cols = 2;
  const colWidth = (pageWidth - MARGIN * 2) / cols;
  const rowHeight = 7;
  const lines = Math.ceil(rows.length / cols);
  const height = lines * rowHeight + 4;

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(MARGIN, y, pageWidth - MARGIN * 2, height, 2, 2, "FD");

  rows.forEach((row, i) => {
    const col = i % cols;
    const line = Math.floor(i / cols);
    const x = MARGIN + col * colWidth + 4;
    const ty = y + 6.5 + line * rowHeight;
    setFont(ctx, "bold", 8.5, MUTED);
    const label = safe(ctx, row.label);
    doc.text(label, x, ty);
    setFont(ctx, "normal", 9.5, NAVY);
    const labelWidth = Math.max(doc.getTextWidth(label) + 4, 24);
    doc.text(fit(ctx, row.value, colWidth - labelWidth - 8), x + labelWidth, ty);
  });

  return y + height + 6;
}

function drawSummaryCards(ctx: PdfContext, cards: PdfSummaryCard[], y: number): number {
  if (cards.length === 0) return y;
  const { doc, pageWidth } = ctx;
  const gap = 4;
  const width = (pageWidth - MARGIN * 2 - gap * (cards.length - 1)) / cards.length;
  const height = 22;

  cards.forEach((card, i) => {
    const x = MARGIN + i * (width + gap);
    doc.setFillColor(240, 253, 250);
    doc.setDrawColor(153, 246, 228);
    doc.roundedRect(x, y, width, height, 2.5, 2.5, "FD");
    doc.setFillColor(...TEAL);
    doc.rect(x, y + 3, 1.2, height - 6, "F");

    setFont(ctx, "normal", 8, MUTED);
    doc.text(fit(ctx, card.labelEn, width - 8), x + 4, y + 6.5);
    setFont(ctx, "bold", 9, NAVY);
    doc.text(fit(ctx, card.labelAr, width - 8), x + width - 3, y + 6.5, { align: "right" });
    setFont(ctx, "bold", 15, TEAL);
    doc.text(fit(ctx, card.value, width - 8), x + width / 2, y + 17, { align: "center" });
  });

  return y + height + 7;
}

type Column<T> = {
  en: string;
  ar: string;
  width: number;
  value: (row: T) => string;
  align?: "left" | "right" | "center";
  sub?: (row: T) => string | undefined;
};

function drawTable<T>(ctx: PdfContext, columns: Column<T>[], rows: T[], startY: number): number {
  const { doc } = ctx;
  const headerHeight = 11;
  let y = startY;

  const drawHead = () => {
    doc.setFillColor(...TEAL);
    doc.rect(MARGIN, y, columns.reduce((s, c) => s + c.width, 0), headerHeight, "F");
    let x = MARGIN;
    for (const col of columns) {
      setFont(ctx, "bold", 8, 255);
      cellText(ctx, col.en, x, col.width, y + 4.5, col.align ?? "left");
      setFont(ctx, "bold", 8.5, 255);
      cellText(ctx, col.ar, x, col.width, y + 9, col.align ?? "left");
      x += col.width;
    }
    y += headerHeight;
  };

  drawHead();

  rows.forEach((row, idx) => {
    const hasSub = columns.some((c) => c.sub?.(row));
    const rowHeight = hasSub ? 11 : 8;
    if (y + rowHeight > CONTENT_BOTTOM) {
      doc.addPage();
      y = 20;
      drawHead();
    }
    if (idx % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(MARGIN, y, columns.reduce((s, c) => s + c.width, 0), rowHeight, "F");
    }
    let x = MARGIN;
    for (const col of columns) {
      setFont(ctx, "normal", 9, NAVY);
      cellText(ctx, col.value(row) || "-", x, col.width, y + 5.2, col.align);
      const sub = col.sub?.(row);
      if (sub) {
        setFont(ctx, "normal", 7, MUTED);
        cellText(ctx, sub, x, col.width, y + 9, col.align);
      }
      x += col.width;
    }
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.1);
    doc.line(MARGIN, y + rowHeight, MARGIN + columns.reduce((s, c) => s + c.width, 0), y + rowHeight);
    y += rowHeight;
  });

  return y + 6;
}

function ensureSpace(ctx: PdfContext, y: number, needed: number): number {
  if (y + needed <= CONTENT_BOTTOM) return y;
  ctx.doc.addPage();
  return 20;
}

function drawNotes(ctx: PdfContext, notes: string | undefined, y: number): number {
  if (!notes) return y;
  const { doc, pageWidth } = ctx;
  setFont(ctx, "normal", 8.5, MUTED);
  const lines = doc.splitTextToSize(safe(ctx, notes), pageWidth - MARGIN * 2);
  y = ensureSpace(ctx, y, lines.length * 4.5 + 4);
  doc.text(lines, MARGIN, y);
  return y + lines.length * 4.5 + 4;
}

function drawSeal(ctx: PdfContext, y: number) {
  const { doc, pageWidth } = ctx;
  y = ensureSpace(ctx, y, 40);
  const cx = pageWidth - MARGIN - 20;
  const cy = y + 18;
  doc.setDrawColor(...TEAL);
  doc.setLineWidth(0.8);
  doc.circle(cx, cy, 17, "S");
  doc.setLineWidth(0.3);
  doc.circle(cx, cy, 14.5, "S");
  setFont(ctx, "bold", 7, TEAL);
  doc.text("HEALTH UNITED", cx, cy - 5, { align: "center" });
  setFont(ctx, "bold", 9, TEAL);
  doc.text(safe(ctx, "هيلث المتحدة"), cx, cy + 1, { align: "center" });
  setFont(ctx, "normal", 6, TEAL);
  doc.text("OFFICIAL · CO. LTD", cx, cy + 6.5, { align: "center" });

  setFont(ctx, "normal", 8.5, MUTED);
  doc.text(safe(ctx, "Authorized signature / التوقيع المعتمد"), MARGIN, cy + 4);
  doc.setDrawColor(203, 213, 225);
  doc.line(MARGIN, cy + 12, MARGIN + 70, cy + 12);
}

function drawFooters(ctx: PdfContext) {
  const { doc, pageWidth, pageHeight } = ctx;
  const total = doc.getNumberOfPages();
  for (let page = 1; page <= total; page++) {
    doc.setPage(page);

    if (ctx.logo) {
      try {
        const GState = (doc as unknown as { GState: new (o: { opacity: number }) => unknown }).GState;
        const setGState = (doc as unknown as { setGState: (s: unknown) => void }).setGState.bind(doc);
        setGState(new GState({ opacity: 0.05 }));
        doc.addImage(ctx.logo, "PNG", pageWidth / 2 - 45, pageHeight / 2 - 45, 90, 90);
        setGState(new GState({ opacity: 1 }));
      } catch {
        // watermark is decorative
      }
    }

    doc.setDrawColor(...TEAL);
    doc.setLineWidth(0.4);
    doc.line(MARGIN, pageHeight - 16, pageWidth - MARGIN, pageHeight - 16);
    setFont(ctx, "normal", 7.5, MUTED);
    doc.text("Generated electronically by Health United System", MARGIN, pageHeight - 11);
    doc.text(
      safe(ctx, "تم إنشاء هذا المستند إلكترونياً بواسطة نظام هيلث المتحدة"),
      MARGIN,
      pageHeight - 7
    );
    setFont(ctx, "bold", 8, NAVY);
    doc.text(`Page ${page} / ${total}`, pageWidth - MARGIN, pageHeight - 9, { align: "right" });
  }
}

function formatMoney(n: number) {
  return `${Number(n || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} SDG`;
}

// ---------------------------------------------------------------------------
// Official documents (invoices / payment receipts)
// ---------------------------------------------------------------------------
export async function buildOfficialPdf(payload: OfficialPdfPayload): Promise<jsPDF> {
  const ctx = await createDoc();
  const { doc, pageWidth } = ctx;

  let y = drawHeader(ctx, payload.title);
  y = drawInfoGrid(
    ctx,
    [
      { label: "Reference / المرجع", value: payload.reference },
      { label: "Date / التاريخ", value: payload.date },
      { label: payload.partyLabel, value: payload.partyName },
      ...(payload.meta ?? []),
    ],
    y
  );

  const width = pageWidth - MARGIN * 2;
  y = drawTable<PdfLineItem>(
    ctx,
    [
      { en: "Item", ar: "الصنف", width: width * 0.46, value: (r) => r.name },
      { en: "Qty", ar: "الكمية", width: width * 0.12, value: (r) => String(r.quantity), align: "center" },
      { en: "Unit Price", ar: "سعر الوحدة", width: width * 0.21, value: (r) => formatMoney(r.unitPrice), align: "right" },
      { en: "Total", ar: "الإجمالي", width: width * 0.21, value: (r) => formatMoney(r.total), align: "right" },
    ],
    payload.items,
    y
  );

  y = ensureSpace(ctx, y, 16);
  doc.setFillColor(240, 253, 250);
  doc.setDrawColor(153, 246, 228);
  doc.roundedRect(pageWidth - MARGIN - 90, y, 90, 12, 2, 2, "FD");
  setFont(ctx, "bold", 10, NAVY);
  doc.text(safe(ctx, `${payload.totalLabel || "Total"} / الإجمالي`), pageWidth - MARGIN - 87, y + 7.8);
  setFont(ctx, "bold", 11, TEAL);
  doc.text(formatMoney(payload.totalAmount), pageWidth - MARGIN - 3, y + 7.8, { align: "right" });
  y += 20;

  y = drawNotes(ctx, payload.notes, y);
  drawSeal(ctx, y + 2);
  drawFooters(ctx);
  return doc;
}

// ---------------------------------------------------------------------------
// Transfer / dispatch reports
// ---------------------------------------------------------------------------
export async function buildTransferPdf(payload: TransferPdfPayload): Promise<jsPDF> {
  const ctx = await createDoc();
  const { doc, pageWidth } = ctx;

  let y = drawHeader(ctx, payload.title, payload.titleAr);
  y = drawInfoGrid(
    ctx,
    [
      { label: "Reference / المرجع", value: payload.reference },
      { label: "Generated / تاريخ الإنشاء", value: payload.date },
      ...(payload.meta ?? []),
      { label: payload.partyLabel, value: payload.partyName },
    ],
    y
  );

  if (payload.summaryCards?.length) {
    y = drawSummaryCards(ctx, payload.summaryCards, y);
  } else if (payload.summaryLines?.length) {
    setFont(ctx, "normal", 9.5, NAVY);
    for (const line of payload.summaryLines) {
      doc.text(safe(ctx, line), MARGIN, y);
      y += 5.5;
    }
    y += 3;
  }

  const width = pageWidth - MARGIN * 2;
  y = drawTable<TransferPdfItem>(
    ctx,
    [
      {
        en: "Item Name",
        ar: "اسم المنتج",
        width: width * 0.3,
        value: (r) => r.name,
        sub: (r) => r.date,
      },
      { en: "Category", ar: "التصنيف", width: width * 0.13, value: (r) => r.category ?? "-", align: "center" },
      { en: "Batch No", ar: "رقم الدفعة", width: width * 0.18, value: (r) => r.batch ?? "-" },
      { en: "Unit", ar: "الوحدة", width: width * 0.11, value: (r) => r.unitType, align: "center" },
      { en: "Qty", ar: "الكمية", width: width * 0.09, value: (r) => String(r.quantity), align: "center" },
      { en: "Status", ar: "الحالة", width: width * 0.19, value: (r) => r.status ?? "-", align: "center" },
    ],
    payload.items,
    y
  );

  y = drawNotes(ctx, payload.notes, y);
  drawSeal(ctx, y + 2);
  drawFooters(ctx);
  return doc;
}

export async function downloadTransferPdf(payload: TransferPdfPayload, filename: string) {
  const doc = await buildTransferPdf(payload);
  doc.save(filename);
  return doc;
}

export async function getTransferPdfBlob(payload: TransferPdfPayload): Promise<Blob> {
  const doc = await buildTransferPdf(payload);
  return doc.output("blob");
}

export async function downloadOfficialPdf(payload: OfficialPdfPayload, filename: string) {
  const doc = await buildOfficialPdf(payload);
  doc.save(filename);
  return doc;
}

export async function getOfficialPdfBlob(payload: OfficialPdfPayload): Promise<Blob> {
  const doc = await buildOfficialPdf(payload);
  return doc.output("blob");
}

export function shareViaEmail(subject: string, body: string) {
  const url = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.open(url, "_blank");
}

export function shareViaWhatsApp(text: string) {
  const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

export async function sharePdfFile(
  blob: Blob,
  filename: string,
  title: string,
  text: string
) {
  const file = new File([blob], filename, { type: "application/pdf" });
  const nav = navigator as Navigator & {
    canShare?: (data?: ShareData) => boolean;
    share?: (data: ShareData) => Promise<void>;
  };

  if (nav.share && (!nav.canShare || nav.canShare({ files: [file] }))) {
    await nav.share({ files: [file], title, text });
    return true;
  }

  // Fallback: download + open share sheet alternatives
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return false;
}
