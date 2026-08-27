import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { STATUS, TENANT_ID } from "@/lib/constants";

// Department Dashboard: summary + workload รายคน + แยกตาม subcategory
// ย้ายมาจาก main.py: @app.get("/api/teams/workload")
// อัปเดต: team_id เป็น optional แล้ว — ไม่ส่งมา = โหมด "ทุกฝ่าย" (aggregate ทั้ง tenant)
//   - เพิ่ม TENANT_ID filter ทุก query กัน cross-tenant leak ตอนไม่มี team_id คั่นแล้ว
//   - เพิ่ม DISTINCT/DISTINCT ON กันพนักงานที่อยู่หลายทีมถูกนับซ้ำตอน aggregate ข้ามทีม

const OPEN_STATUSES = [STATUS.PENDING, STATUS.IN_PROGRESS, STATUS.PAUSED];
const pctOrNull = (onTime: number, total: number) =>
  total > 0 ? Math.round((onTime / Math.max(total, 1)) * 100 * 10) / 10 : null;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const teamId = searchParams.get("team_id"); // null = ทุกฝ่าย
    const startDate = searchParams.get("start_date") || "2025-01-01";
    const endDate = searchParams.get("end_date") || "2025-12-31";
    const endDateFull = `${endDate} 23:59:59`;

    // ---- ป้ายชื่อทีม/ฝ่าย ----
    let team: any = { team_name: "ทุกฝ่าย", team_code: "ALL", department_name: null, department_code: null };
    if (teamId) {
      const teamResult = await pool.query(
        `
        SELECT t.team_name, t.team_code, d.department_name, d.department_code
        FROM teams t
        LEFT JOIN departments d ON t.department_id = d.department_id
        WHERE t.team_id = $1 AND t.tenant_id = $2
        `,
        [teamId, TENANT_ID]
      );
      if (!teamResult.rows[0]) {
        return NextResponse.json({ success: false, error: "ไม่พบทีมนี้" }, { status: 404 });
      }
      team = teamResult.rows[0];
    }

    // ---- จำนวนเจ้าหน้าที่ (dedupe ข้ามทีมด้วย DISTINCT user_id) ----
    const staffCountResult = await pool.query(
      `
      SELECT COUNT(DISTINCT tm.user_id) AS n
      FROM team_members tm
      JOIN teams t ON t.team_id = tm.team_id
      WHERE tm.is_active = true AND t.tenant_id = $1
        AND ($2::uuid IS NULL OR tm.team_id = $2)
      `,
      [TENANT_ID, teamId]
    );

    // ---- เคสค้าง: ใช้ tenant_id ตรงๆ กัน cross-tenant leak ----
    const backlogResult = await pool.query(
      `
      SELECT COUNT(*) AS n FROM complaints
      WHERE tenant_id = $1 AND ($2::uuid IS NULL OR assigned_team_id = $2)
        AND current_status_id IN ($3, $4, $5)
      `,
      [TENANT_ID, teamId, ...OPEN_STATUSES]
    );

    const deptSlaResult = await pool.query(
      `
      SELECT
          COUNT(*) FILTER (WHERE vcs.is_resolution_breached = FALSE
                             AND (c.resolved_at IS NOT NULL OR c.closed_at IS NOT NULL)) AS on_time,
          COUNT(*) FILTER (WHERE vcs.is_resolution_breached IS NOT NULL
                             AND (c.resolved_at IS NOT NULL OR c.closed_at IS NOT NULL)) AS total_with_sla
      FROM complaints      c
      JOIN v_complaint_sla vcs ON c.complaint_id = vcs.complaint_id
      WHERE c.tenant_id = $1 AND ($2::uuid IS NULL OR c.assigned_team_id = $2)
        AND c.created_at BETWEEN $3 AND $4
      `,
      [TENANT_ID, teamId, startDate, endDateFull]
    );
    const deptSla = deptSlaResult.rows[0] || {};
    const deptTotalSla = Number(deptSla.total_with_sla || 0);
    const deptOnTime = Number(deptSla.on_time || 0);
    const deptSlaPct = deptTotalSla > 0 ? Math.round((deptOnTime / deptTotalSla) * 100 * 10) / 10 : 0;

    // ---- รายพนักงาน: dedupe คนที่อยู่หลายทีมด้วย DISTINCT ON ก่อน join เคส ----
    const staffResult = await pool.query(
      `
      WITH staff_scope AS (
        SELECT DISTINCT ON (tm.user_id) tm.user_id, tm.team_id
        FROM team_members tm
        JOIN teams t ON t.team_id = tm.team_id
        WHERE tm.is_active = true AND t.tenant_id = $6
          AND ($7::uuid IS NULL OR tm.team_id = $7)
        ORDER BY tm.user_id, tm.team_id
      )
      SELECT
          u.user_id,
          COALESCE(u.display_name, TRIM(u.first_name || ' ' || u.last_name)) AS name,
          r.role_name,
          MIN(t.team_name) AS team_name,
          COUNT(c.complaint_id) FILTER (WHERE c.current_status_id IN ($1, $2, $3)) AS active_count,
          COUNT(c.complaint_id) FILTER (
              WHERE c.current_status_id IN ($1, $2, $3)
                AND vcs.remaining_sla_min IS NOT NULL AND vcs.remaining_sla_min < 0
          ) AS overdue_count,
          COUNT(c.complaint_id) FILTER (
              WHERE vcs.is_resolution_breached = FALSE
                AND (c.resolved_at IS NOT NULL OR c.closed_at IS NOT NULL)
                AND c.created_at BETWEEN $4 AND $5
          ) AS on_time,
          COUNT(c.complaint_id) FILTER (
              WHERE vcs.is_resolution_breached IS NOT NULL
                AND (c.resolved_at IS NOT NULL OR c.closed_at IS NOT NULL)
                AND c.created_at BETWEEN $4 AND $5
          ) AS total_with_sla,
          COUNT(c.complaint_id) FILTER (WHERE c.created_at BETWEEN $4 AND $5) AS assigned_count,
          COUNT(c.complaint_id) FILTER (
              WHERE c.created_at BETWEEN $4 AND $5
                AND (c.resolved_at IS NOT NULL OR c.closed_at IS NOT NULL)
          ) AS done_count,
          AVG(
              EXTRACT(EPOCH FROM (COALESCE(c.resolved_at, c.closed_at) - c.created_at)) / 3600.0
          ) FILTER (
              WHERE c.created_at BETWEEN $4 AND $5
                AND (c.resolved_at IS NOT NULL OR c.closed_at IS NOT NULL)
          ) AS avg_resolution_hours
      FROM staff_scope su
      JOIN users u ON u.user_id = su.user_id
      LEFT JOIN teams t ON t.team_id = su.team_id
      LEFT JOIN roles r ON u.role_id = r.role_id
      LEFT JOIN complaints c ON c.assigned_user_id = u.user_id AND c.tenant_id = $6
      LEFT JOIN v_complaint_sla vcs ON c.complaint_id = vcs.complaint_id
      GROUP BY u.user_id, name, r.role_name
      ORDER BY active_count DESC
      `,
      [...OPEN_STATUSES, startDate, endDateFull, TENANT_ID, teamId]
    );

    const subcatResult = await pool.query(
      `
      SELECT
          sub.subcategory_name,
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE vcs.is_resolution_breached = FALSE
                             AND (c.resolved_at IS NOT NULL OR c.closed_at IS NOT NULL)) AS on_time,
          COUNT(*) FILTER (WHERE vcs.is_resolution_breached IS NOT NULL
                             AND (c.resolved_at IS NOT NULL OR c.closed_at IS NOT NULL)) AS total_with_sla
      FROM complaints      c
      JOIN subcategories   sub ON c.subcategory_id = sub.subcategory_id
      JOIN v_complaint_sla vcs ON c.complaint_id   = vcs.complaint_id
      WHERE c.tenant_id = $1 AND ($2::uuid IS NULL OR c.assigned_team_id = $2)
        AND c.created_at BETWEEN $3 AND $4
      GROUP BY sub.subcategory_id, sub.subcategory_name
      ORDER BY total DESC
      `,
      [TENANT_ID, teamId, startDate, endDateFull]
    );

    return NextResponse.json({
      team: {
        name: team.team_name,
        code: team.team_code,
        department_name: team.department_name,
        department_code: team.department_code,
      },
      summary: {
        staff_count: Number(staffCountResult.rows[0]?.n || 0),
        active_cases: Number(backlogResult.rows[0]?.n || 0),
        sla_pct: deptSlaPct,
      },
      staff: staffResult.rows.map((s) => ({
        user_id: String(s.user_id),
        name: s.name || "ไม่ระบุชื่อ",
        role: s.role_name || "เจ้าหน้าที่",
        team_name: s.team_name || null, // มีประโยชน์เฉพาะตอนโหมด "ทุกฝ่าย" ให้รู้ว่าใครอยู่ฝ่ายไหน
        active_count: Number(s.active_count || 0),
        overdue_count: Number(s.overdue_count || 0),
        assigned_count: Number(s.assigned_count || 0),
        done_count: Number(s.done_count || 0),
        avg_resolution_hours:
          s.avg_resolution_hours !== null ? Math.round(Number(s.avg_resolution_hours) * 10) / 10 : null,
        sla_pct: pctOrNull(Number(s.on_time || 0), Number(s.total_with_sla || 0)),
      })),
      subcategories: subcatResult.rows.map((r) => ({
        subcategory: r.subcategory_name,
        total: Number(r.total || 0),
        sla_pct: pctOrNull(Number(r.on_time || 0), Number(r.total_with_sla || 0)),
      })),
    });
  } catch (error: any) {
    console.error("DB ERROR (/api/teams/workload):", error);
    return NextResponse.json(
      { success: false, error: error?.message || String(error) },
      { status: 500 }
    );
  }
}