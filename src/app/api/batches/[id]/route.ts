import { NextResponse } from "next/server";
import { updateWarehouseItem } from "@/lib/warehouse/update-item";

export const dynamic = "force-dynamic";

async function handle(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "بيانات الطلب غير صالحة" }, { status: 400 });
  }
  const result = await updateWarehouseItem({ ...body, batchId: decodeURIComponent(id) });
  return NextResponse.json(result.body, { status: result.status });
}

export { handle as PATCH, handle as PUT };
