import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { TENANT_ID } from "@/lib/constants";

// สรุป action ทั้งหมด สำหรับ Funnel Chart
// ย้ายมาจาก main.py: @app.get("/api/workflow")
// หมายเหตุ: endpoint นี้ (ต่างจาก trend/by-area) team_id ใช้กรองจริงในโค้ดเดิม จึงพอร์ตมาให้ทำงานจริง

const LABEL_MAP: Record<string, string> = {
  SUBMIT: "ยื่นเรื่อง",
  ASSIGNED: "มอบหมาย",
  RESOLVED: "แก้ไขแล้ว",
  CLOSED: "ปิดเรื่อง",
  REJECT: "ปฏิเสธ",
  REOPEN: "เปิดใหม่",
  PAUSED: "พักงาน",
};

const ORDER_MAP: Record<string, number> = {
  SUBMIT: 1,
  ASSIGNED: 3,
  RESOLVED: 6,
  CLOSED: 7,
  REOPEN: 5,
  REJECT: 2,
  PAUSED: 4
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const startDate = searchParams.get("start_date") || "2025-01-01";
    const endDate = searchParams.get("end_date") || "2025-12-31";
    const teamId = searchParams.get("team_id");

    const params: any[] = [TENANT_ID, startDate, `${endDate} 23:59:59`];
    let teamFilter = "";
    if (teamId) {
      params.push(teamId);
      teamFilter = `AND c.assigned_team_id = $${params.length}`;
    }

    const result = await pool.query(
      `
      SELECT wl.action_type, COUNT(*) AS total
      FROM workflow_logs wl
      JOIN complaints    c  ON wl.complaint_id = c.complaint_id
      WHERE c.tenant_id = $1
        AND wl.action_datetime BETWEEN $2 AND $3
        ${teamFilter}
      GROUP BY wl.action_type
      `,
      params
    );

    const data = result.rows
      .map((r) => ({
        action: r.action_type,
        label: LABEL_MAP[r.action_type] || r.action_type,
        count: Number(r.total),
        _order: ORDER_MAP[r.action_type] ?? 7,
      }))
      .sort((a, b) => a._order - b._order)
      .map(({ _order, ...rest }) => rest);

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("DB ERROR (/api/workflow):", error);
    return NextResponse.json(
      { success: false, error: error?.message || String(error) },
      { status: 500 }
    );
  }
}