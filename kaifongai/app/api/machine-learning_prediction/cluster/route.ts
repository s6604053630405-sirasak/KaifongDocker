import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getDistrictCoords } from "@/lib/bangkok-district-coords";

// ผลลัพธ์ Cluster ล่าสุดจาก Spatial Clustering Model
// (อ่านจาก cluster_model_runs ที่ is_active = TRUE)
// ย้ายมาจาก main.py: @app.get("/api/ml/cluster")

function toPointCoords(arr: number[] | null | undefined) {
  // array ต้องมีอย่างน้อย 2 ค่า (pc1, pc2) ถึงจะพล็อตบนกราฟ 2 มิติได้
  if (!arr || arr.length < 2) return null;
  const vals = arr.map((v) => Number(v));
  return { pca: vals, pc1: vals[0], pc2: vals[1] };
}

export async function GET() {
  try {
    const runResult = await pool.query(`
      SELECT run_id, model_name, k, silhouette_score, n_districts, features_used, trained_at
      FROM cluster_model_runs WHERE is_active = TRUE
    `);

    const run = runResult.rows[0];
    if (!run) {
      return NextResponse.json(
        { success: false, error: "Cluster model not ready" },
        { status: 503 }
      );
    }

    const groupsResult = await pool.query(
      `
      SELECT cluster_id, cluster_label_no AS id, label, color,
             top_category AS category, avg_volume, risk_score, insight,
             centroid_pca
      FROM cluster_groups WHERE run_id = $1 ORDER BY cluster_label_no ASC
      `,
      [run.run_id]
    );

    const districtResult = await pool.query(
      `
      SELECT m.cluster_id, m.district, m.total_complaints, m.pca_coords
      FROM cluster_district_map m
      JOIN cluster_groups g ON g.cluster_id = m.cluster_id
      WHERE g.run_id = $1
      `,
      [run.run_id]
    );

    const districtsByCluster: Record<string, string[]> = {};
    const pointsByCluster: Record<string, any[]> = {};

    for (const r of districtResult.rows) {
      districtsByCluster[r.cluster_id] = districtsByCluster[r.cluster_id] || [];
      districtsByCluster[r.cluster_id].push(r.district);

      const coords = toPointCoords(r.pca_coords);
      const geo = getDistrictCoords(r.district); // { lat, lng } | null — สำหรับปักหมุดบนแผนที่จริง

      if (coords !== null || geo !== null) {
        pointsByCluster[r.cluster_id] = pointsByCluster[r.cluster_id] || [];
        pointsByCluster[r.cluster_id].push({
          district: r.district,
          ...(coords || {}),
          lat: geo?.lat ?? null,
          lng: geo?.lng ?? null,
          total_complaints:
            r.total_complaints !== null ? Number(r.total_complaints) : null,
        });
      }
    }

    const clusters = groupsResult.rows.map((g) => ({
      id: g.id,
      label: g.label,
      color: g.color,
      category: g.category,
      avg_volume: g.avg_volume,
      risk_score: g.risk_score,
      insight: g.insight,
      districts: districtsByCluster[g.cluster_id] || [],
      points: pointsByCluster[g.cluster_id] || [],
      centroid: toPointCoords(g.centroid_pca),
    }));

    return NextResponse.json({
      clusters,
      model: {
        name: run.model_name,
        k: run.k,
        silhouette_score:
          run.silhouette_score !== null ? Number(run.silhouette_score) : null,
        trained_at: run.trained_at
          ? new Date(run.trained_at).toISOString().slice(0, 16).replace("T", " ")
          : null,
      },
    });
  } catch (error: any) {
    console.error("DB ERROR (/api/ml/cluster):", error);
    return NextResponse.json(
      { success: false, error: error?.message || String(error) },
      { status: 500 }
    );
  }
}