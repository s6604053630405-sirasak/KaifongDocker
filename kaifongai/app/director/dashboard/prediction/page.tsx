"use client";

// app/director/ai-insight/page.tsx
// พอร์ตมาจาก complaint_frontend/src/App.js → PredictionPage (บรรทัด 1645-2440)
// เปลี่ยนจาก axios+FastAPI แยกพอร์ต → fetch() เรียก /api/machine-learning_prediction/*
// ในโปรเจกต์เดียวกัน, เปลี่ยนสไตล์จาก App.css → Tailwind

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import {
  LineChart, Line, BarChart, Bar, Cell, ComposedChart,
  ScatterChart, Scatter, ZAxis,
  ResponsiveContainer, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine,
} from "recharts";
import {
  X, Filter, TriangleAlert, Eye, BarChart3, Tag, MapPin,
  Lightbulb, PartyPopper, Info, Map as MapIcon, ScatterChart as ScatterIcon,
} from "lucide-react";

// leaflet เรียกใช้ window ตอน render จึงต้องปิด SSR ไว้เสมอ
const ClusterMapChart = dynamic(() => import("@/components/ui/Director/ClusterMapChart"), {
  ssr: false,
  loading: () => <Skeleton height={340} />,
});

// ── สี (ตรงกับ COLOR object เดิมใน App.js) ─────────────────────
const COLOR = {
  green: "#00875A",
  amber: "#E67E00",
  red: "#D32F2F",
  purple: "#6B4EAD",
  dark: "#3F4444",
  gray: "#64748B",
  border: "#E8EAEC",
  card: "#FFFFFF",
  text: "#1A1C1E",
  muted: "#6B6E72",
};
const PIE_COLORS = ["#FFD100", "#3F4444", "#00875A", "#E67E00", "#6B4EAD", "#A7A8AA"];
const RISK_TIER_COLOR: Record<string, string> = { LOW: COLOR.green, MEDIUM: COLOR.amber, HIGH: COLOR.red };
const RISK_TIER_LABEL: Record<string, string> = { LOW: "ต่ำ", MEDIUM: "ปานกลาง", HIGH: "สูง" };
const RISK_LEVEL_OPTIONS = [
  { id: "ALL", label: "ทุกระดับ" },
  { id: "HIGH", label: "สูง" },
  { id: "MEDIUM", label: "ปานกลาง" },
  { id: "LOW", label: "ต่ำ" },
];

function formatRiskPct(score: number | null | undefined) {
  return score != null ? `${(score * 100).toFixed(1)}%` : "—";
}
function riskColor(pct: number | null | undefined) {
  const p = pct ?? 0;
  if (p >= 60) return COLOR.red;
  if (p >= 30) return COLOR.amber;
  return COLOR.green;
}
function monthsAgoStart(today: string, n: number) {
  const d = new Date(today);
  d.setMonth(d.getMonth() - (n - 1));
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

// ── Hook ดึงข้อมูลจาก API ในโปรเจกต์เดียวกัน (same-origin, ไม่ต้องมี base URL) ──
function useApi<T = any>(endpoint: string | null, params: Record<string, any> = {}) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(!!endpoint);

  const fetchData = useCallback(async () => {
    if (!endpoint) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
      });
      const url = qs.toString() ? `${endpoint}?${qs}` : endpoint;
      const res = await fetch(url);
      const json = await res.json();
      setData(json);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, JSON.stringify(params)]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading };
}

// ── UI พื้นฐาน ───────────────────────────────────────────────
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-gray-200 bg-white p-5 shadow-sm ${className}`}>
      {children}
    </div>
  );
}
function CardTitle({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 font-bold text-[15px] text-[#1A1C1E]">
        <span className="inline-block h-4 w-1 rounded bg-[#FFD100]" />
        {children}
      </div>
      {sub && <div className="mt-1 text-xs text-gray-500">{sub}</div>}
    </div>
  );
}
function Skeleton({ height = 200 }: { height?: number }) {
  return <div className="animate-pulse rounded-xl bg-gray-100" style={{ height }} />;
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl bg-gray-50 py-8 text-center text-sm text-gray-400">{children}</div>;
}
function Badge({ label, color = COLOR.gray }: { label: string; color?: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{ background: color + "22", color, border: `1px solid ${color}40` }}
    >
      {label}
    </span>
  );
}
function InfoTip({ text }: { text: string }) {
  return (
    <span className="group relative ml-1 inline-flex align-middle cursor-help text-gray-400" tabIndex={0}>
      <Info className="h-3.5 w-3.5" strokeWidth={2.5} />
      <span className="pointer-events-none absolute left-1/2 top-5 z-20 hidden w-64 -translate-x-1/2 rounded-lg bg-gray-900 p-2.5 text-xs leading-relaxed text-white group-hover:block group-focus:block">
        {text}
      </span>
    </span>
  );
}
function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/55 p-5"
      onClick={onClose}
    >
      <div
        className="relative max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="ปิด"
          className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200"
        >
          <X className="h-4 w-4" strokeWidth={2.5} />
        </button>
        {children}
      </div>
    </div>
  );
}
const ChartTip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-semibold">{label || "—"}</div>
      {payload.map((p: any) => (
        <div key={p.name} style={{ color: p.color }}>
          {p.name}: <b>{p.value?.toLocaleString?.() ?? p.value}</b>
        </div>
      ))}
    </div>
  );
};

// ── ตารางเสี่ยงรายหมวดหมู่ / รายเขต ────────────────────────────
function RiskBreakdownList({ items, byCategory, loading }: { items: any[]; byCategory?: boolean; loading: boolean }) {
  if (loading) return <Skeleton height={200} />;
  if (!items?.length) return <Empty>ไม่มีข้อมูลความเสี่ยง</Empty>;
  const sorted = [...items].sort((a, b) => (b.avg_risk_pct || 0) - (a.avg_risk_pct || 0));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
            <th className="py-2">{byCategory ? "หมวดหมู่" : "เขต/พื้นที่"}</th>
            <th className="py-2">จำนวนเรื่อง</th>
            <th className="py-2">เรื่องเสี่ยงสูง</th>
            <th className="py-2">ระดับความเสี่ยงเฉลี่ย</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((it, i) => {
            const col = riskColor(it.avg_risk_pct);
            return (
              <tr key={i} className="border-b border-gray-100 last:border-0">
                <td className="py-2.5 font-medium">
                  {byCategory ? <Badge label={it.name} color={it.color || PIE_COLORS[i % PIE_COLORS.length]} /> : it.district}
                </td>
                <td className="py-2.5">{it.total?.toLocaleString?.() ?? "—"}</td>
                <td className="py-2.5 font-semibold" style={{ color: COLOR.red }}>{it.high_count ?? 0}</td>
                <td className="py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-200">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${Math.min(Math.max(it.avg_risk_pct || 0, 0), 100)}%`, background: col }}
                      />
                    </div>
                    <span className="min-w-[42px] text-right font-semibold" style={{ color: col }}>
                      {it.avg_risk_pct}%
                    </span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── ตารางเรื่อง (ใช้ร่วมกันสำหรับ "ต้องจัดการด่วน" และ "เฝ้าระวัง") ──
function slaLabelFor(r: number | null, urgentStyle: boolean) {
  if (r == null) return { label: "ไม่มีข้อมูล SLA", color: COLOR.muted };
  if (r < 0) return { label: `เกิน SLA ${Math.abs(r)} วัน`, color: COLOR.red };
  if (r === 0) return { label: "ครบกำหนดวันนี้", color: urgentStyle ? COLOR.red : COLOR.amber };
  return { label: `เหลืออีก ${r} วัน`, color: urgentStyle ? COLOR.amber : COLOR.green };
}
function RiskCasesTable({
  cases, loading, onRowClick, urgentStyle = false,
}: { cases: any[]; loading: boolean; onRowClick: (c: any) => void; urgentStyle?: boolean }) {
  if (loading) return <Skeleton height={260} />;
  if (!cases?.length) return (
    <Empty>
      {urgentStyle ? (
        <span className="inline-flex items-center gap-1.5"><PartyPopper className="h-4 w-4 text-amber-500" strokeWidth={2.2} />ไม่มีเรื่องที่ SLA ใกล้ขาดหรือขาดแล้วตอนนี้</span>
      ) : "ไม่พบเรื่องที่ตรงกับเงื่อนไข"}
    </Empty>
  );
  return (
    <div className="max-h-80 overflow-y-auto overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-white">
          <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
            <th className="py-2">เลขเรื่อง</th>
            <th className="py-2">พื้นที่</th>
            <th className="py-2">ประเภท</th>
            <th className="py-2">สถานะ SLA</th>
            <th className="py-2">ระดับความเสี่ยง</th>
            <th className="py-2">ระดับ</th>
          </tr>
        </thead>
        <tbody>
          {cases.map((c, i) => {
            const col = RISK_TIER_COLOR[c.risk_tier] || COLOR.gray;
            const sla = slaLabelFor(c.sla_remaining_days, urgentStyle);
            return (
              <tr
                key={c.complaint_id || i}
                className="cursor-pointer border-b border-gray-100 last:border-0 hover:bg-gray-50"
                onClick={() => onRowClick(c)}
              >
                <td className="py-2.5 font-mono font-semibold">{c.complaint_no}</td>
                <td className="py-2.5">{c.district}</td>
                <td className="py-2.5">{c.type_name || "—"}</td>
                <td className="py-2.5 font-semibold" style={{ color: sla.color }}>{sla.label}</td>
                <td className="py-2.5 font-semibold" style={{ color: col }}>{formatRiskPct(c.risk_score)}</td>
                <td className="py-2.5">
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold"
                    style={{ background: col + "18", color: col }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: col }} />
                    {RISK_TIER_LABEL[c.risk_tier] || c.risk_tier}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── SHAP explainability panel ──────────────────────────────────
function ExplainPanel({ c }: { c: any }) {
  const col = RISK_TIER_COLOR[c.risk_tier] || COLOR.gray;
  const tierLabel = RISK_TIER_LABEL[c.risk_tier] || c.risk_tier;
  const factors = Array.isArray(c.shap_top_factors) ? c.shap_top_factors : [];
  const chartData = [...factors].sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));

  return (
    <div className="p-6">
      <div className="mb-5 flex items-start justify-between pr-6">
        <div>
          <div className="mb-0.5 text-xs text-gray-500">{c.district} · {c.type_name}</div>
          <div className="font-mono text-base font-bold">{c.complaint_no}</div>
        </div>
        <div className="text-right">
          <div
            className="mb-1 inline-block rounded-full px-2.5 py-1 text-xs font-bold"
            style={{ background: col + "18", color: col }}
          >
            ● ระดับ{tierLabel}
          </div>
          <div className="text-2xl font-extrabold" style={{ color: col }}>
            {(c.risk_score * 100).toFixed(1)}%
          </div>
          <div className="text-[11px] text-gray-500">ระดับความเสี่ยง</div>
        </div>
      </div>

      <div className="mb-1 flex items-center gap-1.5">
        <span className="inline-block h-4 w-[3px] rounded bg-[#E67E00]" />
        <span className="text-sm font-bold">ทำไมเรื่องนี้ถึงได้คะแนนนี้</span>
      </div>
      <div className="mb-3 text-xs text-gray-500">ปัจจัยที่มีผลต่อคะแนนมากสุด เรียงจากบนลงล่าง</div>

      {!chartData.length ? (
        <Empty>ยังไม่มีข้อมูลปัจจัยเสี่ยงสำหรับเรื่องนี้</Empty>
      ) : (
        <ResponsiveContainer width="100%" height={chartData.length * 42 + 20}>
          <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 30, left: 10, bottom: 0 }} barCategoryGap={14}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLOR.border} horizontal={false} />
            <XAxis
              type="number"
              domain={[-0.3, 0.3]}
              tickFormatter={(v) => `${v > 0 ? "+" : ""}${(v * 100).toFixed(0)}`}
              tick={{ fontSize: 11, fill: COLOR.muted }}
            />
            <YAxis type="category" dataKey="factor" width={200} tick={{ fontSize: 12, fill: COLOR.text }} />
            <ReferenceLine x={0} stroke={COLOR.text} strokeWidth={1} />
            <Tooltip cursor={{ fill: "rgba(0,0,0,.03)" }} />
            <Bar dataKey="impact" radius={4} barSize={18}>
              {chartData.map((f: any, i: number) => (
                <Cell key={i} fill={f.impact >= 0 ? COLOR.red : COLOR.green} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}

      <div className="mt-2 flex gap-4 border-t border-dashed border-gray-200 pt-2.5 text-[11.5px] text-gray-500">
        <span><span style={{ color: COLOR.red }}>■</span> ดันความเสี่ยงขึ้น</span>
        <span><span style={{ color: COLOR.green }}>■</span> ดึงความเสี่ยงลง</span>
      </div>
    </div>
  );
}

// ── กราฟแนวโน้ม SLA: ปริมาณเรื่องรวม (แท่ง) + %SLA (เส้น) ───────────
const SLA_TARGET_PCT = 90;
const SlaTrendTip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const total = payload.find((p: any) => p.dataKey === "total")?.value;
  const pct = payload.find((p: any) => p.dataKey === "sla_pct")?.value;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-semibold">{label || "—"}</div>
      {total != null && <div style={{ color: COLOR.gray }}>เรื่องทั้งหมด: <b>{total.toLocaleString()}</b></div>}
      {pct != null && <div style={{ color: riskColor(100 - pct) }}>%SLA: <b>{pct}%</b></div>}
    </div>
  );
};
function SlaTrendChart({ today }: { today: string | null }) {
  const { data, loading } = useApi<any[]>(
    today ? "/api/machine-learning_prediction/risk/sla-trend" : null,
    { start_date: today ? monthsAgoStart(today, 12) : undefined, end_date: today || undefined }
  );
  const rawRows = Array.isArray(data) ? data : [];
  const rows = rawRows.map((r) => {
    const onTime = Number(r.on_time) || 0;
    const breached = Number(r.breached) || 0;
    const total = onTime + breached;
    return { ...r, total, sla_pct: total > 0 ? Math.round((onTime / total) * 1000) / 10 : null };
  });
  const isLoading = !today || loading;

  return (
    <Card>
      <CardTitle sub="ปริมาณเรื่องร้องเรียนรวมรายเดือน เทียบกับสัดส่วนที่จบตรง SLA (%) ย้อนหลัง 12 เดือนล่าสุด">
        แนวโน้มการปฏิบัติตาม SLA
      </CardTitle>
      <div className="mb-2 flex gap-4 text-xs text-gray-500">
        <span><span style={{ color: COLOR.gray }}>■</span> เรื่องร้องเรียนทั้งหมด/เดือน</span>
        <span><span style={{ color: COLOR.green }}>●</span> %SLA</span>
        <span><span style={{ color: COLOR.red }}>┄</span> เป้าหมาย {SLA_TARGET_PCT}%</span>
      </div>
      <div style={{ height: 240 }}>
        {isLoading ? (
          <Skeleton height={220} />
        ) : rows.length === 0 ? (
          <Empty>ไม่มีข้อมูลแนวโน้ม SLA</Empty>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLOR.border} vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis yAxisId="left" tick={{ fontSize: 10 }} stroke={COLOR.gray} />
              <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 10 }} stroke={COLOR.green} unit="%" />
              <Tooltip content={<SlaTrendTip />} />
              <Bar yAxisId="left" dataKey="total" name="เรื่องร้องเรียนทั้งหมด" fill={COLOR.border} radius={[4, 4, 0, 0]} barSize={28} />
              <Line yAxisId="right" type="monotone" dataKey="sla_pct" name="%SLA" stroke={COLOR.green} strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
              <ReferenceLine yAxisId="right" y={SLA_TARGET_PCT} stroke={COLOR.red} strokeDasharray="5 3" strokeWidth={1.5} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}

// ── ประเภทปัญหาที่เกิน SLA มากที่สุด ───────────────────────────
function TopBreachCategories({ today }: { today: string | null }) {
  const { data, loading } = useApi<any[]>(
    today ? "/api/machine-learning_prediction/risk/top-breach-categories" : null,
    { start_date: today ? monthsAgoStart(today, 12) : undefined, end_date: today || undefined, limit: 6 }
  );
  const rows = Array.isArray(data) ? data : [];
  const isLoading = !today || loading;
  const maxCount = Math.max(1, ...rows.map((r) => r.breach_count));

  return (
    <Card>
      <CardTitle sub="ประเภทปัญหาที่เกิดเรื่องเกิน SLA มากที่สุด ย้อนหลัง 12 เดือนล่าสุด">
        ประเภทปัญหาที่เกิน SLA มากที่สุด
      </CardTitle>
      {isLoading ? (
        <Skeleton height={220} />
      ) : rows.length === 0 ? (
        <Empty>ไม่มีเรื่องที่เกิน SLA ในช่วงนี้</Empty>
      ) : (
        <div className="space-y-3">
          {rows.map((r, i) => (
            <div key={i}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 font-medium">
                  <span className="h-2 w-2 rounded-full" style={{ background: r.color }} />
                  {r.name}
                </span>
                <span className="text-gray-500">
                  {r.breach_count} เรื่อง <span className="text-gray-400">· เสี่ยง {r.breach_pct}%</span>
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                <div className="h-full rounded-full" style={{ width: `${(r.breach_count / maxCount) * 100}%`, background: r.color }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── ส่วนรายเรื่อง: ค้นหา + กรองระดับ + ตารางเร่งด่วน/เฝ้าระวัง ────────
function RiskCasesSection() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [level, setLevel] = useState("ALL");
  const [explainCase, setExplainCase] = useState<any>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const commonParams = { level: level === "ALL" ? undefined : level, search: debouncedSearch || undefined };
  const { data: urgentData, loading: ul } = useApi<any>("/api/machine-learning_prediction/risk/cases", { ...commonParams, group: "urgent", limit: 50 });
  const { data: watchData, loading: wl } = useApi<any>("/api/machine-learning_prediction/risk/cases", { ...commonParams, group: "watch", limit: 50 });

  const urgentCases = Array.isArray(urgentData?.cases) ? urgentData.cases : [];
  const watchCases = Array.isArray(watchData?.cases) ? watchData.cases : [];
  const urgentTotal = urgentData?.total ?? urgentCases.length;
  const watchTotal = watchData?.total ?? watchCases.length;

  return (
    <>
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        {/* ตัวกรอง */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1 text-xs font-semibold text-gray-500"><Filter className="h-3.5 w-3.5" strokeWidth={2.5} />ตัวกรอง</span>
          <input
            type="text"
            placeholder="ค้นหาเลขเรื่อง / พื้นที่ / ประเภท"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-w-[220px] flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-[#FFD100] focus:outline-none"
          />
          <div className="flex gap-1.5">
            {RISK_LEVEL_OPTIONS.map((o) => {
              const isActive = level === o.id;
              const pillColor = o.id === "ALL" ? COLOR.dark : RISK_TIER_COLOR[o.id];
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setLevel(o.id)}
                  className="rounded-full border px-3 py-1 text-xs font-semibold transition-colors"
                  style={
                    isActive
                      ? { background: pillColor + "18", color: pillColor, borderColor: pillColor + "55" }
                      : { background: "#fff", color: COLOR.muted, borderColor: COLOR.border }
                  }
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 font-bold text-[15px]">
              <span className="inline-block h-4 w-1 rounded bg-[#FFD100]" />
              รายการเรื่องร้องเรียนที่ต้องเร่งดำเนินการ
            </div>
            <div className="mt-1 text-xs text-gray-500">
              แยกตามความเร่งด่วนจริง (SLA คงเหลือ
              <InfoTip text="SLA (Service Level Agreement) คือระยะเวลามาตรฐานที่กำหนดให้แก้ไขเรื่องร้องเรียนแต่ละประเภทให้เสร็จ 'SLA คงเหลือ' คือเวลาที่เหลืออยู่ก่อนครบกำหนดนั้น" />
              ) ไม่ใช่แค่ Risk Score
              <InfoTip text="Risk Score คือคะแนนที่ AI คำนวณให้แต่ละเรื่อง บอกโอกาส (0-100%) ที่เรื่องนั้นจะแก้ไขไม่ทัน SLA — เรื่อง Risk Score สูงบางเรื่องอาจยังมีเวลาเหลือ จึงต้องดูคู่กับ SLA คงเหลือด้วย" />
            </div>
          </div>
          <div className="flex gap-3 text-xs text-gray-500">
            <span><span style={{ color: RISK_TIER_COLOR.LOW }}>●</span> ต่ำ</span>
            <span><span style={{ color: RISK_TIER_COLOR.MEDIUM }}>●</span> ปานกลาง</span>
            <span><span style={{ color: RISK_TIER_COLOR.HIGH }}>●</span> สูง</span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-gray-100 p-4">
            <CardTitle sub={ul ? "กำลังโหลด..." : `${urgentTotal.toLocaleString()} เรื่อง${urgentTotal > urgentCases.length ? ` (แสดง ${urgentCases.length})` : ""}`}>
              <span className="inline-flex items-center gap-1.5"><TriangleAlert className="h-4 w-4" style={{ color: COLOR.red }} strokeWidth={2.3} />เรื่องร้องเรียนที่ต้องดำเนินการเร่งด่วน (เกินกำหนด SLA)</span>
            </CardTitle>
            <RiskCasesTable cases={urgentCases} loading={ul} onRowClick={setExplainCase} urgentStyle />
          </div>
          <div className="rounded-xl border border-gray-100 p-4">
            <CardTitle sub={wl ? "กำลังโหลด..." : `${watchTotal.toLocaleString()} เรื่อง${watchTotal > watchCases.length ? ` (แสดง ${watchCases.length})` : ""}`}>
              <span className="inline-flex items-center gap-1.5"><Eye className="h-4 w-4 text-gray-500" strokeWidth={2.3} />เรื่องร้องเรียนที่เฝ้าระวัง (ความเสี่ยงสูง / ยังไม่เกิน SLA)</span>
            </CardTitle>
            <RiskCasesTable cases={watchCases} loading={wl} onRowClick={setExplainCase} />
          </div>
        </div>
      </div>

      {explainCase && (
        <Modal onClose={() => setExplainCase(null)}>
          <ExplainPanel c={explainCase} />
        </Modal>
      )}
    </>
  );
}

// ── Cluster scatter chart (PCA) ─────────────────────────────────
function CentroidMark({ cx, cy, label }: any) {
  if (cx == null || cy == null) return null;
  return (
    <g>
      <line x1={cx - 6} y1={cy - 6} x2={cx + 6} y2={cy + 6} stroke="#1A1C1E" strokeWidth={2.5} strokeLinecap="round" />
      <line x1={cx - 6} y1={cy + 6} x2={cx + 6} y2={cy - 6} stroke="#1A1C1E" strokeWidth={2.5} strokeLinecap="round" />
      <text x={cx} y={cy - 11} textAnchor="middle" style={{ fontSize: 11, fontWeight: 700, fill: "#1A1C1E" }}>{label}</text>
    </g>
  );
}
const ClusterScatterTip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  if (!p.district) return null;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-lg">
      <div className="font-semibold">{p.district}</div>
      <div style={{ color: p.clusterColor }}>{p.clusterLabel}</div>
      {p.total_complaints != null && <div>ปริมาณ: <b>{p.total_complaints.toLocaleString()}</b> เรื่อง</div>}
    </div>
  );
};
function ClusterScatterChart({ clusters, loading }: { clusters: any[]; loading: boolean }) {
  if (loading) return <Skeleton height={340} />;
  const withPoints = (clusters || []).filter((cl) => Array.isArray(cl.points) && cl.points.length);
  if (!withPoints.length) return <Empty>ยังไม่มีข้อมูลตำแหน่งสำหรับกราฟจุดแบ่งกลุ่ม (ต้องเทรนโมเดลรอบใหม่)</Empty>;

  const centroidData = withPoints
    .filter((cl) => cl.centroid)
    .map((cl, i) => ({ pc1: cl.centroid.pc1, pc2: cl.centroid.pc2, label: `C${cl.id ?? i}` }));

  return (
    <ResponsiveContainer width="100%" height={340}>
      <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={COLOR.border} />
        <XAxis type="number" dataKey="pc1" name="PC1" tick={{ fontSize: 10 }} />
        <YAxis type="number" dataKey="pc2" name="PC2" tick={{ fontSize: 10 }} />
        <ZAxis type="number" dataKey="total_complaints" range={[60, 420]} name="ปริมาณเรื่อง" />
        <Tooltip content={<ClusterScatterTip />} cursor={{ strokeDasharray: "3 3" }} />
        {withPoints.map((cl, i) => {
          const col = cl.color || PIE_COLORS[i % PIE_COLORS.length];
          return (
            <Scatter
              key={cl.id ?? i}
              name={cl.label || `กลุ่ม ${i + 1}`}
              data={cl.points.map((p: any) => ({ ...p, clusterLabel: cl.label || `กลุ่ม ${i + 1}`, clusterColor: col }))}
              fill={col}
              fillOpacity={0.75}
            />
          );
        })}
        {centroidData.length > 0 && <Scatter name="จุดศูนย์กลางกลุ่ม" data={centroidData} shape={<CentroidMark />} legendType="none" />}
      </ScatterChart>
    </ResponsiveContainer>
  );
}
function ClusterNameRow({ clusters, loading, onSelect }: { clusters: any[]; loading: boolean; onSelect: (c: any) => void }) {
  if (loading) return <Skeleton height={44} />;
  if (!clusters?.length) return <Empty>ไม่มีข้อมูล Cluster</Empty>;
  const sorted = [...clusters].sort((a, b) => (b.risk_score || 0) - (a.risk_score || 0));
  return (
    <div className="flex flex-wrap gap-2">
      {sorted.map((cl, i) => {
        const col = cl.color || PIE_COLORS[i % PIE_COLORS.length];
        return (
          <button
            key={cl.id ?? i}
            type="button"
            onClick={() => onSelect(cl)}
            className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm"
            style={{ background: col + "12", borderColor: col + "55" }}
          >
            <span className="h-2 w-2 rounded-full" style={{ background: col }} />
            <span className="font-medium">{cl.label || `กลุ่มที่ ${i + 1}`}</span>
            <span className="font-semibold" style={{ color: riskColor(cl.risk_score) }}>
              {cl.risk_score != null ? `${cl.risk_score}%` : "—"}
            </span>
            <span className="text-gray-400">›</span>
          </button>
        );
      })}
    </div>
  );
}

// ── หน้าหลัก ─────────────────────────────────────────────────
export default function AIInsightPage() {
  const { data: riskData, loading: rk } = useApi<any>("/api/machine-learning_prediction/risk");
  const { data: clusterData, loading: cl } = useApi<any>("/api/machine-learning_prediction/cluster");
  const { data: latestDateData } = useApi<any>("/api/system-latest-date");
  const today = latestDateData?.latest_date || null;
  const [selectedCluster, setSelectedCluster] = useState<any>(null);
  const [clusterView, setClusterView] = useState<"map" | "pca">("map");

  const safeByCategory = Array.isArray(riskData?.by_category) ? riskData.by_category : [];
  const safeByDistrict = Array.isArray(riskData?.by_district) ? riskData.by_district : [];
  const safeClusters = Array.isArray(clusterData?.clusters) ? clusterData.clusters : [];
  const riskSummary = riskData?.summary || {};
  const topCategory = safeByCategory[0];
  const topDistrict = safeByDistrict[0];

  const riskInsightDefs = [
    {
      Icon: TriangleAlert, label: "เรื่องร้องเรียนเสี่ยงเกิน SLA",
      value: rk ? "…" : (riskSummary.high ?? 0), accentColor: COLOR.red,
      sub: `จาก ${riskSummary.total?.toLocaleString() ?? "—"} เรื่องที่ประเมิน`,
    },
    {
      Icon: BarChart3, label: "ระดับความเสี่ยงเฉลี่ย",
      tip: "Risk Score คือคะแนนที่ AI คำนวณให้แต่ละเรื่อง บอกโอกาส (0-100%) ที่เรื่องนั้นจะแก้ไขไม่ทัน SLA ยิ่งคะแนนสูง ยิ่งควรรีบจัดการ",
      value: rk ? "…" : (riskSummary.avg_risk_pct !== undefined ? `${riskSummary.avg_risk_pct}%` : "—"),
      accentColor: COLOR.amber, sub: "เฉลี่ยทุกเรื่องที่ประเมิน",
    },
    {
      Icon: Tag, label: "หมวดหมู่งานเสี่ยงสูงสุด",
      value: rk ? "…" : (topCategory?.name || "—"), accentColor: topCategory?.color || COLOR.purple,
      sub: topCategory ? `ระดับความเสี่ยงเฉลี่ย ${topCategory.avg_risk_pct}% · เสี่ยงสูง ${topCategory.high_count} เรื่อง` : "ไม่มีข้อมูล",
    },
    {
      Icon: MapPin, label: "เขตเสี่ยงสูงสุด",
      value: rk ? "…" : (topDistrict?.district || "—"), accentColor: COLOR.dark,
      sub: topDistrict ? `ระดับความเสี่ยงเฉลี่ย ${topDistrict.avg_risk_pct}% · เสี่ยงสูง ${topDistrict.high_count} เรื่อง` : "ไม่มีข้อมูล",
    },
  ];

  return (
    <div className="flex flex-col gap-5 p-6">
      <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <Lightbulb className="mt-0.5 h-4 w-4 flex-none" strokeWidth={2.2} />
        <span>หน้านี้ใช้ <b>ประเมินความเสี่ยงล่วงหน้า</b> ว่าเรื่องร้องเรียนใดมีแนวโน้มดำเนินการไม่แล้วเสร็จภายในระยะเวลาที่กำหนด (SLA) พร้อมจัดกลุ่มพื้นที่ที่มีลักษณะปัญหาคล้ายกัน 
        เพื่อช่วยจัดลำดับความสำคัญในการดำเนินงานและป้องกันไม่ให้ปัญหาลุกลาม</span>
      </div>

      {/* สรุปแบบแถบเดียว */}
      <Card>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-gray-100">
          {riskInsightDefs.map((k, i) => (
            <div key={i} className={`flex min-w-0 items-start gap-3 ${i > 0 ? "lg:pl-5" : ""}`}>
              <span
                className="flex h-10 w-10 flex-none items-center justify-center rounded-xl"
                style={{ background: k.accentColor + "18", color: k.accentColor }}
              >
                <k.Icon className="h-5 w-5" strokeWidth={2.2} />
              </span>
              <div className="min-w-0">
                <div className="flex items-center text-xs text-gray-500">
                  {k.label}
                  {"tip" in k && k.tip && <InfoTip text={k.tip} />}
                </div>
                <div
                  className="truncate text-xl font-bold"
                  style={{ color: k.accentColor }}
                  title={typeof k.value === "string" ? k.value : undefined}
                >
                  {k.value}
                </div>
                <div className="truncate text-xs text-gray-400" title={k.sub}>{k.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* ความเสี่ยงรายหมวดหมู่ / รายพื้นที่ */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardTitle sub="ระดับความเสี่ยงเฉลี่ย และจำนวนเรื่องเสี่ยงสูงต่อหมวดหมู่">หมวดหมู่งานเสี่ยงเกิน SLA</CardTitle>
          <RiskBreakdownList items={safeByCategory} byCategory loading={rk} />
        </Card>
        <Card>
          <CardTitle sub="ระดับความเสี่ยงเฉลี่ย และจำนวนเรื่องเสี่ยงสูงต่อเขต">พื้นที่เสี่ยงเกิน SLA</CardTitle>
          <RiskBreakdownList items={safeByDistrict} loading={rk} />
        </Card>
      </div>

      {/* แนวโน้ม + Top breach categories */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SlaTrendChart today={today} />
        <TopBreachCategories today={today} />
      </div>

      {/* รายเรื่อง */}
      <RiskCasesSection />

      {!rk && riskData?.model && (
        <div className="flex flex-wrap gap-3 text-xs text-gray-500">
          <span>โมเดล: <b>{riskData.model.name || "—"}</b></span>
          {riskData.model.roc_auc != null && (
            <span>
              ROC-AUC: <b>{riskData.model.roc_auc.toFixed(3)}</b>
              <InfoTip text="ROC-AUC = ค่าความแม่นยำของโมเดล AI มีค่าตั้งแต่ 0-1 ยิ่งใกล้ 1 ยิ่งทำนายแม่นยำ (0.5 คือทำนายมั่วๆ)" />
            </span>
          )}
          <span>ฝึกโมเดลล่าสุด: <b>{riskData.model.trained_at || "—"}</b></span>
        </div>
      )}

      {/* Spatial Clustering */}
      <Card>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <CardTitle
            sub={
              clusterView === "map"
                ? "จุดแต่ละจุด = 1 เขต (ปักบนแผนที่จริง)  ขนาดจุด = ปริมาณเรื่องร้องเรียน  สีตามกลุ่ม"
                : "จุดแต่ละจุด = 1 เขต  ขนาดจุด = ปริมาณเรื่องร้องเรียน  สีตามกลุ่ม — คลิกชื่อกลุ่มด้านล่างเพื่อดูรายชื่อพื้นที่ทั้งหมด"
            }
          >
            การจัดกลุ่มพื้นที่เสี่ยง
            <InfoTip text="AI ใช้เทคนิค K-means / DBSCAN ในการจัดกลุ่มพื้นที่ที่มีลักษณะปัญหาคล้ายกันโดยอัตโนมัติ มุมมองแผนที่ปักหมุดตามพิกัดจริงของแต่ละเขต ส่วนมุมมอง PCA เป็นตำแหน่งที่ได้จากการย่อมิติข้อมูล (เครื่องหมาย X คือจุดศูนย์กลางของแต่ละกลุ่ม)" />
          </CardTitle>
          <div className="flex flex-none rounded-lg border border-gray-200 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setClusterView("map")}
              className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 font-medium ${
                clusterView === "map" ? "bg-[#1A1C1E] text-white" : "text-gray-500"
              }`}
            >
              <MapIcon className="h-3.5 w-3.5" strokeWidth={2.3} />
              แผนที่
            </button>
            <button
              type="button"
              onClick={() => setClusterView("pca")}
              className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 font-medium ${
                clusterView === "pca" ? "bg-[#1A1C1E] text-white" : "text-gray-500"
              }`}
            >
              <ScatterIcon className="h-3.5 w-3.5" strokeWidth={2.3} />
              PCA
            </button>
          </div>
        </div>

        {clusterView === "map" ? (
          cl ? <Skeleton height={340} /> : <ClusterMapChart clusters={safeClusters} />
        ) : (
          <ClusterScatterChart clusters={safeClusters} loading={cl} />
        )}

        <div className="h-3.5" />
        <ClusterNameRow clusters={safeClusters} loading={cl} onSelect={setSelectedCluster} />
        {clusterData?.model && (
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-500">
            <span>โมเดล: <b>{clusterData.model.name}</b></span>
            {clusterData.model.k && <span>จำนวนกลุ่ม: <b>{clusterData.model.k} กลุ่ม </b></span>}
            <span>ฝึกโมเดลล่าสุด: <b>{clusterData.model.trained_at || "—"}</b></span>
          </div>
        )}
      </Card>

      {selectedCluster && (
        <Modal onClose={() => setSelectedCluster(null)}>
          <div className="p-6">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-base font-bold">{selectedCluster.label || `Cluster ${selectedCluster.id}`}</span>
              <span className="text-xs font-bold" style={{ color: riskColor(selectedCluster.risk_score) }}>
                Risk {selectedCluster.risk_score != null ? `${selectedCluster.risk_score}%` : "—"}
              </span>
            </div>
            {selectedCluster.category && (
              <div className="my-2.5">
                <span className="mr-1 text-xs text-gray-500">หมวดหลัก:</span>
                <Badge label={selectedCluster.category} color={selectedCluster.color || COLOR.purple} />
              </div>
            )}
            {selectedCluster.insight && <div className="mb-3.5 flex items-start gap-1.5 text-xs text-gray-500"><Lightbulb className="mt-0.5 h-3.5 w-3.5 flex-none" strokeWidth={2.2} />{selectedCluster.insight}</div>}
            <div className="mb-2 text-xs font-bold">พื้นที่ในกลุ่มนี้ ({selectedCluster.districts?.length ?? 0} เขต)</div>
            <div className="flex flex-wrap gap-1.5">
              {(selectedCluster.districts || []).map((d: string, j: number) => (
                <span key={j} className="rounded-full bg-gray-100 px-2.5 py-1 text-xs">{d}</span>
              ))}
              {!(selectedCluster.districts || []).length && <span className="text-xs text-gray-400">ไม่มีข้อมูลรายชื่อพื้นที่</span>}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}