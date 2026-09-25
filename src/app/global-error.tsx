"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] global error:", error);
  }, [error]);

  return (
    <html lang="ar" dir="rtl">
      <body className="font-sans antialiased">
        <div className="flex min-h-screen items-center justify-center p-6">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
            <p className="mb-4 text-sm text-slate-600">
              حدث خطأ غير متوقع أثناء تحميل الصفحة
            </p>
            <div className="flex justify-center gap-2">
              <button
                type="button"
                onClick={reset}
                className="h-10 rounded-lg bg-teal-600 px-4 text-sm font-medium text-white"
              >
                إعادة المحاولة
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="h-10 rounded-lg border border-slate-200 px-4 text-sm font-medium"
              >
                تحديث الصفحة
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
