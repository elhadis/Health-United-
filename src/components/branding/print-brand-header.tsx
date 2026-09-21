import { BrandLogo } from "@/components/branding/brand-logo";
import {
  COMPANY_NAME_AR,
  COMPANY_NAME_EN,
  APP_TAGLINE,
} from "@/lib/branding";

/** Brand block for printed receipts and stock-transfer reports. */
export function PrintBrandHeader({
  documentTitle,
}: {
  documentTitle?: string;
}) {
  return (
    <div className="print-brand-header mb-6 border-b border-slate-300 pb-4 text-center">
      <div className="mx-auto mb-2 flex justify-center">
        <BrandLogo size={72} className="h-16 w-auto max-w-[180px]" />
      </div>
      <h1 className="text-lg font-bold text-secondary">{COMPANY_NAME_AR}</h1>
      <p className="text-xs font-semibold tracking-wide text-slate-600">
        {COMPANY_NAME_EN}
      </p>
      <p className="mt-1 text-xs text-slate-500">{APP_TAGLINE}</p>
      {documentTitle && (
        <p className="mt-3 text-sm font-semibold text-primary">{documentTitle}</p>
      )}
    </div>
  );
}
