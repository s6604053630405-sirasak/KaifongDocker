"use client";

// components/ClusterMapChart.tsx
// แผนที่จริง (react-leaflet) แทนกราฟ PCA — จุดแต่ละจุด = 1 เขต, สีตาม cluster, ขนาดจุดตามปริมาณเรื่องร้องเรียน
//
// ติดตั้งก่อนใช้งาน:
//   npm install leaflet react-leaflet
//   npm install -D @types/leaflet
//
// สำคัญ: ห้าม import ไฟล์นี้แบบ static ใน Server Component เพราะ leaflet เรียกใช้ window
// ให้ import แบบ dynamic + ssr:false เท่านั้น (ดูตัวอย่างใน page.tsx)

import { MapContainer, TileLayer, CircleMarker, Tooltip as LeafletTooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";

const BANGKOK_CENTER: [number, number] = [13.7563, 100.5018];

// scale ขนาดจุดตามปริมาณเรื่องร้องเรียน (คล้าย ZAxis เดิมในกราฟ PCA)
function radiusFromVolume(volume: number | null | undefined, min = 6, max = 22) {
  if (!volume || volume <= 0) return min;
  // sqrt scale กันจุดใหญ่มากบดบังจุดเล็ก
  const scaled = Math.sqrt(volume);
  return Math.min(max, Math.max(min, scaled * 1.4));
}

export interface ClusterMapPoint {
  district: string;
  lat: number | null;
  lng: number | null;
  total_complaints?: number | null;
  clusterLabel?: string;
  clusterColor?: string;
}

export default function ClusterMapChart({
  clusters,
}: {
  clusters: any[]; // เหมือน prop เดิมของ ClusterScatterChart: [{ id, label, color, points: [...] }]
}) {
  const withGeo = (clusters || []).filter(
    (cl) => Array.isArray(cl.points) && cl.points.some((p: any) => p.lat != null && p.lng != null)
  );

  if (!withGeo.length) {
    return (
      <div className="flex h-[340px] items-center justify-center rounded-xl bg-gray-50 text-sm text-gray-400">
        ยังไม่มีข้อมูลพิกัดสำหรับปักหมุดแผนที่ (ตรวจสอบว่าชื่อเขตใน DB ตรงกับตาราง lookup)
      </div>
    );
  }

  return (
    <div className="h-[340px] w-full overflow-hidden rounded-xl">
      <MapContainer
        center={BANGKOK_CENTER}
        zoom={10}
        scrollWheelZoom={false}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {withGeo.map((cl, i) =>
          cl.points
            .filter((p: any) => p.lat != null && p.lng != null)
            .map((p: any, j: number) => (
              <CircleMarker
                key={`${cl.id ?? i}-${j}`}
                center={[p.lat, p.lng]}
                radius={radiusFromVolume(p.total_complaints)}
                pathOptions={{
                  color: cl.color || "#6B4EAD",
                  fillColor: cl.color || "#6B4EAD",
                  fillOpacity: 0.65,
                  weight: 1,
                }}
              >
                <LeafletTooltip direction="top" offset={[0, -4]}>
                  <div className="text-xs">
                    <div className="font-semibold">{p.district}</div>
                    <div>{cl.label}</div>
                    {p.total_complaints != null && (
                      <div>ปริมาณ: {p.total_complaints.toLocaleString()} เรื่อง</div>
                    )}
                  </div>
                </LeafletTooltip>
              </CircleMarker>
            ))
        )}
      </MapContainer>
    </div>
  );
}