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

function formatMoney(n: number) {
  return `${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} SDG`;
}

async function loadLogoDataUrl(): Promise<string | null> {
  try {
    const res = await fetch(LOGO_SRC);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result || ""));
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function buildOfficialPdf(
  payload: OfficialPdfPayload
): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 16;

  const logo = await loadLogoDataUrl();
  if (logo) {
    try {
      doc.addImage(logo, "PNG", pageWidth / 2 - 14, y, 28, 28);
      y += 32;
    } catch {
      y += 4;
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(COMPANY_NAME_EN, pageWidth / 2, y, { align: "center" });
  y += 7;
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(COMPANY_NAME_AR, pageWidth / 2, y, { align: "center" });
  y += 6;
  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text(APP_TAGLINE, pageWidth / 2, y, { align: "center" });
  doc.setTextColor(0);
  y += 8;

  doc.setDrawColor(13, 148, 136);
  doc.setLineWidth(0.6);
  doc.line(18, y, pageWidth - 18, y);
  y += 10;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(payload.title, 18, y);
  y += 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Reference: ${payload.reference}`, 18, y);
  y += 6;
  doc.text(`Date: ${payload.date}`, 18, y);
  y += 6;
  doc.text(`${payload.partyLabel}: ${payload.partyName}`, 18, y);
  y += 6;

  if (payload.meta?.length) {
    for (const row of payload.meta) {
      doc.text(`${row.label}: ${row.value}`, 18, y);
      y += 5.5;
    }
  }

  y += 4;
  doc.setFillColor(15, 23, 42);
  doc.setTextColor(255);
  doc.rect(18, y, pageWidth - 36, 8, "F");
  doc.setFontSize(9);
  doc.text("Item", 22, y + 5.5);
  doc.text("Qty", 95, y + 5.5);
  doc.text("Price", 118, y + 5.5);
  doc.text("Total", 155, y + 5.5);
  doc.setTextColor(0);
  y += 12;

  doc.setFontSize(9);
  for (const item of payload.items) {
    if (y > 270) {
      doc.addPage();
      y = 20;
    }
    const name =
      item.name.length > 42 ? `${item.name.slice(0, 40)}...` : item.name;
    doc.text(name, 22, y);
    doc.text(String(item.quantity), 95, y);
    doc.text(formatMoney(item.unitPrice), 118, y);
    doc.text(formatMoney(item.total), 155, y);
    y += 6.5;
  }

  y += 4;
  doc.setDrawColor(200);
  doc.line(18, y, pageWidth - 18, y);
  y += 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(payload.totalLabel || "Total", 118, y);
  doc.setTextColor(13, 148, 136);
  doc.text(formatMoney(payload.totalAmount), 155, y);
  doc.setTextColor(0);

  if (payload.notes) {
    y += 12;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(80);
    const lines = doc.splitTextToSize(`Notes: ${payload.notes}`, pageWidth - 36);
    doc.text(lines, 18, y);
    doc.setTextColor(0);
  }

  y = Math.max(y + 18, 278);
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(
    `${COMPANY_NAME_EN} · Official document · Generated electronically`,
    pageWidth / 2,
    y,
    { align: "center" }
  );

  return doc;
}

export type TransferPdfItem = {
  name: string;
  quantity: number;
  unitType: string;
  batch?: string;
  category?: string;
  date?: string;
  status?: string;
};

export type TransferPdfPayload = {
  title: string;
  reference: string;
  date: string;
  partyLabel: string;
  partyName: string;
  meta?: Array<{ label: string; value: string }>;
  items: TransferPdfItem[];
  notes?: string;
  summaryLines?: string[];
};

export async function buildTransferPdf(
  payload: TransferPdfPayload
): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 16;

  const logo = await loadLogoDataUrl();
  if (logo) {
    try {
      doc.addImage(logo, "PNG", pageWidth / 2 - 14, y, 28, 28);
      y += 32;
    } catch {
      y += 4;
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(COMPANY_NAME_EN, pageWidth / 2, y, { align: "center" });
  y += 7;
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(COMPANY_NAME_AR, pageWidth / 2, y, { align: "center" });
  y += 6;
  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text(APP_TAGLINE, pageWidth / 2, y, { align: "center" });
  doc.setTextColor(0);
  y += 8;

  doc.setDrawColor(13, 148, 136);
  doc.setLineWidth(0.6);
  doc.line(18, y, pageWidth - 18, y);
  y += 10;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(payload.title, 18, y);
  y += 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Reference: ${payload.reference}`, 18, y);
  y += 6;
  doc.text(`Date: ${payload.date}`, 18, y);
  y += 6;
  doc.text(`${payload.partyLabel}: ${payload.partyName}`, 18, y);
  y += 6;

  if (payload.meta?.length) {
    for (const row of payload.meta) {
      doc.text(`${row.label}: ${row.value}`, 18, y);
      y += 5.5;
    }
  }

  if (payload.summaryLines?.length) {
    y += 2;
    for (const line of payload.summaryLines) {
      doc.text(line, 18, y);
      y += 5.5;
    }
  }

  const detailed = payload.items.some(
    (i) => i.batch || i.category || i.date || i.status
  );
  const clip = (text: string, max: number) =>
    text.length > max ? `${text.slice(0, max - 2)}..` : text;

  y += 4;
  doc.setFillColor(15, 23, 42);
  doc.setTextColor(255);
  doc.rect(18, y, pageWidth - 36, 8, "F");
  doc.setFontSize(detailed ? 8 : 9);
  if (detailed) {
    doc.text("Item", 20, y + 5.5);
    doc.text("Batch", 70, y + 5.5);
    doc.text("Qty", 104, y + 5.5);
    doc.text("Category", 124, y + 5.5);
    doc.text("Date", 146, y + 5.5);
    doc.text("Status", 174, y + 5.5);
  } else {
    doc.text("Item", 22, y + 5.5);
    doc.text("Qty", 120, y + 5.5);
    doc.text("Unit", 150, y + 5.5);
  }
  doc.setTextColor(0);
  y += 12;

  doc.setFontSize(detailed ? 8 : 9);
  for (const item of payload.items) {
    if (y > 270) {
      doc.addPage();
      y = 20;
    }
    if (detailed) {
      doc.text(clip(item.name, 30), 20, y);
      doc.text(clip(item.batch || "-", 20), 70, y);
      doc.text(`${item.quantity} ${item.unitType}`, 104, y);
      doc.text(item.category || "-", 124, y);
      doc.text(item.date || "-", 146, y);
      doc.text(item.status || "-", 174, y);
    } else {
      doc.text(clip(item.name, 48), 22, y);
      doc.text(String(item.quantity), 120, y);
      doc.text(item.unitType, 150, y);
    }
    y += 6.5;
  }

  if (payload.notes) {
    y += 10;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(80);
    const lines = doc.splitTextToSize(`Notes: ${payload.notes}`, pageWidth - 36);
    doc.text(lines, 18, y);
    doc.setTextColor(0);
  }

  y = Math.max(y + 18, 278);
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(
    `${COMPANY_NAME_EN} · Transfer receipt · Generated electronically`,
    pageWidth / 2,
    y,
    { align: "center" }
  );

  return doc;
}

export async function downloadTransferPdf(
  payload: TransferPdfPayload,
  filename: string
) {
  const doc = await buildTransferPdf(payload);
  doc.save(filename);
  return doc;
}

export async function getTransferPdfBlob(
  payload: TransferPdfPayload
): Promise<Blob> {
  const doc = await buildTransferPdf(payload);
  return doc.output("blob");
}

export async function downloadOfficialPdf(
  payload: OfficialPdfPayload,
  filename: string
) {
  const doc = await buildOfficialPdf(payload);
  doc.save(filename);
  return doc;
}

export async function getOfficialPdfBlob(
  payload: OfficialPdfPayload
): Promise<Blob> {
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
