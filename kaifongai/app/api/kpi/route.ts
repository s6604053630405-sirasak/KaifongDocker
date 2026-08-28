import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { TENANT_ID } from "@/lib/constants";

// ตัวเลข KPI หลัก สำหรับ Card แถวบนสุด (Executive Dashboard)
// ย้ายมาจาก main.py: @app.get("/api/kpi")

function addDays(iso: string, days: number) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const startDate = searchParams.get("start_date") || "2025-01-01";
    const endDate = searchParams.get("end_date") || "2025-12-31";

    const result = await pool.query(
      `
      SELECT
          SUM(total_complaints)   AS total,
          SUM(pending_cases)      AS pending,
          SUM(in_progress_cases)  AS in_progress,
          SUM(paused_cases)       AS paused,
          SUM(resolved_cases)     AS resolved,
          SUM(closed_cases)       AS closed,
          SUM(rejected_cases)     AS rejected,
          SUM(sla_on_time_cases)  AS on_time,
          SUM(sla_breached_cases) AS breached,
          ROUND(
              SUM(sla_on_time_cases) * 100.0
              / NULLIF(SUM(sla_on_time_cases) + SUM(sla_breached_cases), 0),
          1) AS sla_pct,
          ROUND(
              SUM(avg_resolution_hours * (resolved_cases + closed_cases))
              / NULLIF(SUM(resolved_cases + closed_cases), 0),
          1) AS avg_hours
      FROM daily_complaint_summary
      WHERE tenant_id = $1 AND summary_date BETWEEN $2 AND $3
      `,
      [TENANT_ID, startDate, endDate]
    );
    const row = result.rows[0] || {};

    // ช่วงเวลาก่อนหน้า (ยาวเท่ากัน ต่อจากกันย้อนหลังไป) สำหรับคำนวณ % เปลี่ยนแปลง
    const spanDays =
      Math.round(
        (new Date(endDate + "T00:00:00Z").getTime() -
          new Date(startDate + "T00:00:00Z").getTime()) /
          86400000
      ) + 1;
    const pEnd = addDays(startDate, -1);
    const pSt = addDays(startDate, -spanDays);

    // หาวันแรกที่ tenant นี้มีข้อมูลจริงในระบบ ใช้เช็คว่าช่วงก่อนหน้า (prev period)
    // มีข้อมูลครอบคลุมพอจะเทียบเปอร์เซ็นต์ได้อย่างมีความหมายหรือไม่
    const dataStartResult = await pool.query(
      `SELECT MIN(summary_date) AS min_date FROM daily_complaint_summary WHERE tenant_id = $1`,
      [TENANT_ID]
    );
    const dataStartDate: string | null = dataStartResult.rows[0]?.min_date
      ? new Date(dataStartResult.rows[0].min_date).toISOString().slice(0, 10)
      : null;

    // ถ้าช่วงก่อนหน้าเริ่มก่อนวันที่มีข้อมูลจริง แปลว่า prev period ถูกตัดสั้นลง
    // (บางส่วนหรือทั้งหมดไม่มีข้อมูล) การเทียบ % จะไม่มีความหมาย ให้ข้ามการคำนวณเทียบไปเลย
    const prevPeriodHasFullCoverage = dataStartDate ? pSt >= dataStartDate : true;

    let prev: { total?: number; resolved?: number } = {};
    if (prevPeriodHasFullCoverage) {
      const prevResult = await pool.query(
        `
        SELECT SUM(total_complaints) AS total, SUM(resolved_cases) AS resolved
        FROM daily_complaint_summary
        WHERE tenant_id = $1 AND summary_date BETWEEN $2 AND $3
        `,
        [TENANT_ID, pSt, pEnd]
      );
      prev = prevResult.rows[0] || {};
    }

    const pct = (curr: number, p: any) => {
      if (!prevPeriodHasFullCoverage) return null;
      const pNum = Number(p || 0);
      return pNum ? Math.round(((curr - pNum) / pNum) * 100 * 10) / 10 : null;
    };

    const currTotal = Number(row.total || 0);
    const currResolved = Number(row.resolved || 0);

    return NextResponse.json({
      total: currTotal,
      pending: Number(row.pending || 0),
      in_progress: Number(row.in_progress || 0),
      paused: Number(row.paused || 0),
      resolved: currResolved,
      closed: Number(row.closed || 0),
      rejected: Number(row.rejected || 0),
      open_total:
        Number(row.pending || 0) + Number(row.in_progress || 0) + Number(row.paused || 0),
      sla_pct: Number(row.sla_pct || 0),
      avg_hours: Number(row.avg_hours || 0),
      total_delta: pct(currTotal, prev.total),
      resolved_delta: pct(currResolved, prev.resolved),
      prev_period: { start: pSt, end: pEnd },
      prev_period_insufficient_data: !prevPeriodHasFullCoverage,
    });
  } catch (error: any) {
    console.error("DB ERROR (/api/kpi):", error);
    return NextResponse.json(
      { success: false, error: error?.message || String(error) },
      { status: 500 }
    );
  }
}