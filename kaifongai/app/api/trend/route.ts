import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { TENANT_ID } from "@/lib/constants";

// จำนวนเรื่องรายวัน สำหรับ Line Chart
// ย้ายมาจาก main.py: @app.get("/api/trend")
//
// แก้ไขจากของเดิม: ของเดิมอ่านจาก daily_complaint_summary ซึ่งเป็น pre-aggregate
// ระดับ "ทั้ง tenant" เท่านั้น ไม่มีคอลัมน์ team อยู่ในตัว ทำให้พารามิเตอร์ team_id
// ที่รับเข้ามาไม่เคยถูกใช้กรองจริง (dead code ตามที่ comment เดิมบอกไว้)
// เปลี่ยนมาคำนวณจากตาราง complaints ตรง ๆ (มีคอลัมน์ assigned_team_id) แทน
// เพื่อให้กรองทีมได้จริง — response shape เดิมยังเหมือนเดิมทุกอย่าง (date, new_cases,
// done_cases, at_risk) ไม่ได้เพิ่ม sla_pct
//
// หมายเหตุเรื่อง at_risk: ของเดิมหมายถึง "เคสค้างที่เกิน SLA ณ วันนั้น" (snapshot จาก
// batch job รายวันที่คำนวณ daily_complaint_summary ไว้ล่วงหน้า) ค่านี้คำนวณย้อนหลัง
// จากตาราง complaints ตรง ๆ ให้ตรงความหมายเดิมไม่ได้ (ต้องรู้ว่า ณ เวลานั้นเคสยังเปิดอยู่
// และเกิน SLA target หรือยัง ซึ่งต้องมี snapshot ต่อวันจริง ๆ) จึงส่งเป็น 0 ไปก่อนในไฟล์นี้
// ถ้าต้องการค่า at_risk ที่ถูกต้องจริง ต้องตัดสินใจก่อนว่าจะใช้ความหมายไหน แล้วต่อยอดทีหลัง

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const startDate = searchParams.get("start_date") || "2025-01-01";
    const endDate = searchParams.get("end_date") || "2025-12-31";
    const teamId = searchParams.get("team_id");

    const teamFilterNew = teamId ? "AND c.assigned_team_id = $4" : "";
    const teamFilterDone = teamId ? "AND c.assigned_team_id = $4" : "";
    const params = teamId
      ? [TENANT_ID, startDate, `${endDate} 23:59:59`, teamId]
      : [TENANT_ID, startDate, `${endDate} 23:59:59`];

    // เคสใหม่ต่อวัน (ตาม created_at)
    const newResult = await pool.query(
      `
      SELECT
          DATE(c.created_at) AS day,
          COUNT(*)           AS new_cases
      FROM complaints c
      WHERE c.tenant_id = $1
        AND c.created_at BETWEEN $2 AND $3
        ${teamFilterNew}
      GROUP BY day
      `,
      params
    );

    // เคสที่ปิดแล้วต่อวัน (ตาม resolved_at/closed_at)
    const doneResult = await pool.query(
      `
      SELECT
          DATE(COALESCE(c.resolved_at, c.closed_at)) AS day,
          COUNT(*)                                   AS done_cases
      FROM complaints c
      WHERE c.tenant_id = $1
        AND COALESCE(c.resolved_at, c.closed_at) BETWEEN $2 AND $3
        ${teamFilterDone}
      GROUP BY day
      `,
      params
    );

    const byDay = new Map<string, { new_cases: number; done_cases: number }>();
    const get = (day: string) => {
      if (!byDay.has(day)) byDay.set(day, { new_cases: 0, done_cases: 0 });
      return byDay.get(day)!;
    };
    const toDay = (v: any) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v));

    newResult.rows.forEach((r) => { get(toDay(r.day)).new_cases = Number(r.new_cases); });
    doneResult.rows.forEach((r) => { get(toDay(r.day)).done_cases = Number(r.done_cases); });

    const data = Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, b]) => ({
        date: day,
        new_cases: b.new_cases,
        done_cases: b.done_cases,
        at_risk: 0, // ดูหมายเหตุด้านบน: คำนวณ snapshot เดิมจากตารางนี้ตรง ๆ ไม่ได้
      }));

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("DB ERROR (/api/trend):", error);
    return NextResponse.json(
      { success: false, error: error?.message || String(error) },
      { status: 500 }
    );
  }
}