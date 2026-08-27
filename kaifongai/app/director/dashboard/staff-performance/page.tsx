"use client";

// app/director/dashboard/staff-performance/page.tsx
// พอร์ตมาจาก complaint_frontend/src/App.js → StaffPerformancePage (บรรทัด 2529-2795)
// ตัด role-lock ของ staff ออก (ระบบ role ของ KaifongAI ทำแยกอยู่แล้วผ่าน DirectorShell)
// เหลือแค่ dropdown เลือกฝ่าย เพราะหน้านี้อยู่ในโซน Director อยู่แล้ว

import { useState, useEffect, useCallback, useMemo } from "react";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { Calendar, Building2, AlertTriangle, X, Info } from "lucide-react";

const COLOR = {
  primary: "#FFD100", dark: "#3F4444", green: "#00875A", amber: "#E67E00",
  red: "#D32F2F", purple: "#6B4EAD", gray: "#64748B", mid: "#A7A8AA",
  border: "#E8EAEC", text: "#1A1C1E", muted: "#6B6E72",
};
const DEPARTMENT_NAV = [
  { teamCode: "ALL", label: "ทุกฝ่าย" },
  { teamCode: "TEAM_INFRA", label: "โครงสร้างพื้นฐาน" },
  { teamCode: "TEAM_ENV", label: "สิ่งแวดล้อม" },
  { teamCode: "TEAM_HEALTH", label: "สาธารณสุข" },
  { teamCode: "TEAM_ORDER", label: "ความสงบเรียบร้อย" },
  { teamCode: "TEAM_SOCIAL", label: "สวัสดิการสังคม" },
  { teamCode: "TEAM_GOV", label: "การบริการและธรรมาภิบาล" },
];
function slaColor(pct: number) {
  if (pct >= 90) return COLOR.green;
  if (pct >= 75) return COLOR.amber;
  return COLOR.red;
}
function daysAgo(base: string, n: number) { const d = new Date(base); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); }
function buildDatePresets(today: string) {
  return [
    { l: "7 วันล่าสุด", s: daysAgo(today, 6), e: today },
    { l: "เดือนนี้", s: today.slice(0, 7) + "-01", e: today },
    { l: "ปีนี้", s: today.slice(0, 4) + "-01-01", e: today },
    { l: "ทั้งหมด", s: "2024-01-01", e: today },
  ];
}
function aggregateTrend(rows: any[]) {
  if (!Array.isArray(rows) || rows.length === 0) return { data: [] as any[], granularity: "day" as const };
  const spanDays = Math.round((new Date(rows[rows.length - 1].date).getTime() - new Date(rows[0].date).getTime()) / 86400000) + 1;
  if (spanDays <= 31) return { data: rows, granularity: "day" as const };
  const granularity: "week" | "month" = spanDays <= 186 ? "week" : "month";
  const bucketKey = granularity === "week"
    ? (dateStr: string) => { const d = new Date(dateStr); const day = d.getDay(); d.setDate(d.getDate() + ((day === 0 ? -6 : 1) - day)); return d.toISOString().slice(0, 10); }
    : (dateStr: string) => dateStr.slice(0, 7);
  const map = new Map<string, any>();
  rows.forEach((r) => {
    const key = bucketKey(r.date);
    if (!map.has(key)) map.set(key, { date: key, new_cases: 0, done_cases: 0, at_risk: 0 });
    const b = map.get(key); b.new_cases += r.new_cases || 0; b.done_cases += r.done_cases || 0; b.at_risk += r.at_risk || 0;
  });
  return { data: Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date)), granularity };
}
const TREND_TITLE: Record<string, string> = { day: "แนวโน้มรายวัน", week: "แนวโน้มรายสัปดาห์", month: "แนวโน้มรายเดือน" };

function useApi<T = any>(endpoint: string | null, params: Record<string, any> = {}) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(!!endpoint);
  const [error, setError] = useState<string | null>(null);
  const fetchData = useCallback(async () => {
    if (!endpoint) { setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== "") qs.set(k, String(v)); });
      const url = qs.toString() ? `${endpoint}?${qs}` : endpoint;
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok || json?.success === false) throw new Error(json?.error || "โหลดไม่สำเร็จ");
      setData(json);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, JSON.stringify(params)]);
  useEffect(() => { fetchData(); }, [fetchData]);
  return { data, loading, error };
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-gray-200 bg-white p-5 shadow-sm ${className}`}>{children}</div>;
}
function CardTitle({ children, sub, right }: { children: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
      <div>
        <div className="flex items-center gap-2 font-bold text-[15px] text-[#1A1C1E]"><span className="inline-block h-4 w-1 rounded bg-[#FFD100]" />{children}</div>
        {sub && <div className="mt-1 text-xs text-gray-500">{sub}</div>}
      </div>
      {right}
    </div>
  );
}
function Skeleton({ height = 190 }: { height?: number }) { return <div className="animate-pulse rounded-xl bg-gray-100" style={{ height }} />; }
function ErrorBanner({ message = "โหลดข้อมูลไม่สำเร็จ" }: { message?: string }) {
  return <div className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700"><AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={2.5} />{message}</div>;
}
function InfoTip({ text }: { text: string }) {
  return (
    <span className="group relative ml-1 inline-flex align-middle cursor-help text-gray-400" tabIndex={0}>
      <Info className="h-3.5 w-3.5" strokeWidth={2.5} />
      <span className="pointer-events-none absolute left-1/2 top-5 z-20 hidden w-64 -translate-x-1/2 rounded-lg bg-gray-900 p-2.5 text-xs leading-relaxed text-white group-hover:block group-focus:block">{text}</span>
    </span>
  );
}
function Badge({ label, color = COLOR.gray }: { label?: string; color?: string }) {
  return <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: color + "22", color, border: `1px solid ${color}40` }}>{label || "—"}</span>;
}
function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/55 p-5" onClick={onClose}>
      <div className="relative max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} aria-label="ปิด" className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200"><X className="h-4 w-4" strokeWidth={2.5} /></button>
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
      {payload.map((p: any) => <div key={p.name} style={{ color: p.color }}>{p.name}: <b>{p.value?.toLocaleString?.() ?? p.value}</b></div>)}
    </div>
  );
};
function ChartLegend({ items }: { items: [string, string][] }) {
  return <div className="mb-2 flex gap-4 text-xs text-gray-500">{items.map(([l, c]) => <span key={l} className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full" style={{ background: c }} />{l}</span>)}</div>;
}
function KPICard({ label, value, accentColor, sub }: { label: React.ReactNode; value: React.ReactNode; accentColor: string; sub?: React.ReactNode }) {
  return (
    <div className="relative rounded-2xl border border-gray-200 bg-white p-4">
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
        <span className="absolute left-0 top-0 h-full w-1" style={{ background: accentColor }} />
      </div>
      <div className="pl-2 text-xs text-gray-500">{label}</div>
      <div className="pl-2 text-2xl font-extrabold" style={{ color: accentColor }}>{value ?? "—"}</div>
      {sub && <div className="pl-2 text-[11px] text-gray-400">{sub}</div>}
    </div>
  );
}
function RankedStatRow({ rank, name, total, pct, metricLabel = "เป็นไปตาม SLA", countLabel = "เรื่อง" }: { rank: number; name: string; total: number; pct: number | null; metricLabel?: string; countLabel?: string }) {
  const col = pct == null ? COLOR.mid : slaColor(pct);
  return (
    <div className="flex items-center gap-2.5 border-b border-gray-100 py-2 text-sm last:border-0">
      <span className="w-5 text-center text-xs font-bold text-gray-400">{rank}</span>
      <span className="flex-1 truncate" title={name}>{name}</span>
      <span className="text-xs text-gray-400">{total.toLocaleString()} {countLabel}</span>
      <span className="w-30 text-right text-xs font-semibold" style={{ color: col }}>{pct == null ? "ไม่มีข้อมูล" : `${metricLabel} ${pct}%`}</span>
    </div>
  );
}
function StaffWorkloadTableRow({ s, maxActive, avgActive, deptLabel, isTop, onClick }: { s: any; maxActive: number; avgActive: number; deptLabel: string; isTop?: boolean; onClick: () => void }) {
  const pctOfMax = maxActive > 0 ? Math.min(100, Math.round((s.active_count / maxActive) * 100)) : 0;
  const hasOverdue = s.overdue_count > 0;
  const highWorkload = !hasOverdue && avgActive > 0 && s.active_count > avgActive * 1.4;
  const overloaded = hasOverdue || highWorkload;
  const initials = (s.name || "").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w: string) => w[0]).join("").toUpperCase();
  const barColor = hasOverdue ? COLOR.red : highWorkload ? COLOR.amber : pctOfMax >= 60 ? COLOR.amber : COLOR.green;
  return (
    <tr onClick={onClick} className={`cursor-pointer border-b border-gray-100 last:border-0 hover:bg-gray-100 ${isTop ? "bg-green-50" : ""}`}>
      <td className="py-2.5 pr-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold" style={hasOverdue ? { background: "#FDECEA", color: COLOR.red } : highWorkload ? { background: "#FFF3E0", color: COLOR.amber } : { background: "#F0F1F2", color: COLOR.dark }}>{initials || "?"}</span>
          <div>
            <div className="flex items-center gap-1.5 font-medium">
              {s.name}
              {isTop && <span className="whitespace-nowrap rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">🏆 ดีที่สุด</span>}
            </div>
            <div className="text-[11px] text-gray-400">{s.role}</div>
          </div>
        </div>
      </td>
      <td className="whitespace-nowrap py-2.5 pr-4 text-gray-500">{s.team_name || deptLabel}</td>
      <td className="py-2.5 pr-4 text-right font-mono">{s.assigned_count?.toLocaleString() ?? 0}</td>
      <td className="py-2.5 pr-4 text-right font-mono">{s.done_count?.toLocaleString() ?? 0}</td>
      <td className="py-2.5 pr-4 text-right font-mono" style={{ color: overloaded ? barColor : COLOR.text, fontWeight: overloaded ? 700 : 400 }}>{s.active_count?.toLocaleString() ?? 0}</td>
      <td className="py-2.5 pr-4 text-right font-mono">{s.avg_resolution_hours == null ? "—" : s.avg_resolution_hours.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
      <td className="py-2.5 pr-6 text-right whitespace-nowrap font-semibold" style={{ color: s.sla_pct == null ? COLOR.muted : slaColor(s.sla_pct) }}>{s.sla_pct == null ? "ไม่มีข้อมูล" : `${s.sla_pct}%`}</td>
      <td className="py-2.5">
        <div className="flex min-w-[130px] items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full" style={{ width: `${pctOfMax}%`, background: barColor }} /></div>
          {hasOverdue ? <span className="whitespace-nowrap rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-600">เกิน {s.overdue_count}</span>
            : highWorkload ? <span className="whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-600">เยอะ</span>
            : <span className="whitespace-nowrap text-[11px] text-green-600">ปกติ</span>}
        </div>
      </td>
    </tr>
  );
}

// ── Date range bar (เพิ่ม input type="date" ให้เลือกวันที่เองได้ นอกจากปุ่มลัด) ──
function DateRangeBar({ dates, setDates, today }: { dates: { start_date: string; end_date: string }; setDates: (d: any) => void; today: string }) {
  const presets = useMemo(() => buildDatePresets(today), [today]);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm">
      <span className="flex items-center gap-1 text-xs font-semibold text-gray-500"><Calendar className="h-3.5 w-3.5" strokeWidth={2.5} />ช่วงเวลา:</span>
      {presets.map((d) => {
        const active = dates.start_date === d.s && dates.end_date === d.e;
        return (
          <button
            key={d.l}
            onClick={() => setDates({ start_date: d.s, end_date: d.e })}
            className="rounded-full border px-3 py-1 text-xs font-semibold"
            style={active ? { background: "#FFD10030", borderColor: "#FFD100", color: "#8a6d00" } : { borderColor: "#E8EAEC", color: "#6B6E72" }}
          >
            {d.l}
          </button>
        );
      })}

      {/* เลือกวันที่เอง (วัน/เดือน/ปี) — ถ้าใส่แล้วไม่ตรงปุ่มลัดไหนเลย ปุ่มลัดด้านบนจะไม่ active ให้อัตโนมัติ */}
      <span className="ml-2 flex items-center gap-1.5 text-xs text-gray-500">
        ตั้งแต่
        <input
          type="date"
          value={dates.start_date}
          max={dates.end_date}
          onChange={(e) => setDates((d: any) => ({ ...d, start_date: e.target.value }))}
          className="rounded-lg border border-gray-200 px-2 py-1 text-xs focus:border-[#FFD100] focus:outline-none"
        />
        ถึง
        <input
          type="date"
          value={dates.end_date}
          min={dates.start_date}
          max={today}
          onChange={(e) => setDates((d: any) => ({ ...d, end_date: e.target.value }))}
          className="rounded-lg border border-gray-200 px-2 py-1 text-xs focus:border-[#FFD100] focus:outline-none"
        />
      </span>
    </div>
  );
}

// ── หน้าหลัก ─────────────────────────────────────────────────
export default function StaffPerformancePage() {
  // ใช้วันที่จริงของเครื่อง (ไม่ล็อกตามข้อมูลล่าสุดใน DB อีกต่อไป — เหมาะกับการใช้งานจริง)
  const today = new Date().toISOString().slice(0, 10);
  const [dates, setDates] = useState<{ start_date: string; end_date: string }>({ start_date: "2024-01-01", end_date: today });

  const [teamCode, setTeamCode] = useState(DEPARTMENT_NAV[0].teamCode);
  const deptEntry = DEPARTMENT_NAV.find((d) => d.teamCode === teamCode);
  const deptLabel = deptEntry?.label || teamCode;

  const isAllDepartments = teamCode === "ALL";
  const { data: teams } = useApi<any[]>("/api/teams");
  const team = Array.isArray(teams) ? teams.find((t) => t.code === teamCode) : null;
  const teamId = team?.id || null;
  const realDeptName = isAllDepartments ? deptLabel : team?.department_name || deptLabel;

  // teamId เป็น null ทั้งตอน "ทุกฝ่าย" (ตั้งใจ) และตอน /api/teams ยังโหลดไม่เสร็จ (ชั่วคราว)
  // ต้องแยก 2 กรณีนี้ด้วย isAllDepartments ไม่งั้นจะยิง request ก่อนข้อมูลทีมพร้อมจริง
  const canLoad = dates && (teamId || isAllDepartments);
  const teamParams = { ...(dates || {}), team_id: teamId || undefined };
  const { data, loading, error } = useApi<any>(canLoad ? "/api/teams/workload" : null, teamParams);
  const { data: trend, loading: tl } = useApi<any[]>(canLoad ? "/api/trend" : null, teamParams);
  const { data: areas, loading: al } = useApi<any[]>(canLoad ? "/api/by-area" : null, teamParams);
  const { data: wf, loading: wfl } = useApi<any[]>(canLoad ? "/api/workflow" : null, teamParams);

  const summary = data?.summary;
  const staff = Array.isArray(data?.staff) ? data.staff : [];
  const subcats = Array.isArray(data?.subcategories) ? data.subcategories : [];
  const maxActive = staff.length > 0 ? Math.max(...staff.map((s: any) => s.active_count), 1) : 1;
  const avgActive = staff.length > 0 ? staff.reduce((sum: number, s: any) => sum + s.active_count, 0) / staff.length : 0;
  const rawTrend = Array.isArray(trend) ? trend : [];
  const { data: safeTrend, granularity: trendGranularity } = aggregateTrend(rawTrend);
  const safeAreas = Array.isArray(areas) ? areas : [];
  const topAreas = [...safeAreas].sort((a, b) => b.total - a.total).slice(0, 5);
  const safeWf = Array.isArray(wf) ? wf : [];
  const wfColors = [COLOR.primary, COLOR.dark, COLOR.green, COLOR.amber, COLOR.mid, COLOR.purple, COLOR.red];
  const topSubcatsByVolume = [...subcats].sort((a, b) => b.total - a.total).slice(0, 8);

  const [sortBy, setSortBy] = useState<"workload" | "sla" | "sla_top">("workload");
  const sortedStaff = sortBy === "workload" ? staff : [...staff].sort((a, b) => {
    if (a.sla_pct == null) return 1; if (b.sla_pct == null) return -1;
    return sortBy === "sla" ? a.sla_pct - b.sla_pct : b.sla_pct - a.sla_pct;
  });

  // หาผู้ที่ทำ SLA ได้ดีที่สุดในฝ่าย (ต้องมีข้อมูล sla_pct จริง ไม่ใช่ "ไม่มีข้อมูล") เพื่อไฮไลต์เป็นตัวอย่างที่ดี
  const topPerformerId = staff.reduce((bestId: string | null, s: any) => {
    if (s.sla_pct == null) return bestId;
    if (bestId == null) return s.user_id;
    const best = staff.find((x: any) => x.user_id === bestId);
    return s.sla_pct > (best?.sla_pct ?? -1) ? s.user_id : bestId;
  }, null);

  const [selectedStaff, setSelectedStaff] = useState<any>(null);
  const { data: staffCases, loading: scLoading } = useApi<any[]>(selectedStaff ? "/api/staff/cases" : null, selectedStaff ? { user_id: selectedStaff.user_id } : {});
  const safeStaffCases = Array.isArray(staffCases) ? staffCases : [];

  return (
    <div className="flex flex-col gap-5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DateRangeBar dates={dates} setDates={setDates} today={today} />
        <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2">
          <span className="flex items-center gap-1 text-xs font-semibold text-gray-500"><Building2 className="h-3.5 w-3.5" strokeWidth={2.5} />ฝ่าย:</span>
          <select
            value={teamCode}
            onChange={(e) => setTeamCode(e.target.value)}
            className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-700 focus:border-[#FFD100] focus:outline-none"
          >
            {DEPARTMENT_NAV.map((d) => (
              <option key={d.teamCode} value={d.teamCode}>{d.label}</option>
            ))}
          </select>
        </div>
      </div>

      {error ? <ErrorBanner message={`โหลดข้อมูล${isAllDepartments ? "ทุกฝ่าย" : "ฝ่ายนี้"}ไม่สำเร็จ`} /> : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KPICard label="จำนวนเจ้าหน้าที่" value={loading ? "…" : `${summary?.staff_count ?? 0} คน`} accentColor={COLOR.primary} />
            <KPICard
              label={<span>เรื่องค้างดำเนินการ<InfoTip text="เป็นยอดค้าง (pending/in-progress) ณ ตอนนี้เสมอ ไม่ผูกกับช่วงวันที่ที่เลือกด้านบน" /></span>}
              value={loading ? "…" : (summary?.active_cases ?? 0).toLocaleString()} sub="ยอดปัจจุบัน" accentColor={COLOR.dark}
            />
            <KPICard
              label={<span>ภาระงานเฉลี่ยต่อคน<InfoTip text="คำนวณจากเคสค้างปัจจุบัน (snapshot) เหมือน 'เคสค้างทั้งหมด' จึงไม่ผูกกับช่วงวันที่" /></span>}
              value={loading ? "…" : staff.length > 0 ? avgActive.toFixed(1) : "0"} sub="ภาระงานเฉลี่ยต่อเจ้าหน้าที่ ยิ่งค่าสูงยิ่งสะท้อนภาระงานที่มากขึ้น" accentColor={COLOR.purple}
            />
            <KPICard label="อัตราความสำเร็จตาม SLA" value={loading ? "…" : `${summary?.sla_pct ?? 0}%`} sub="ตามช่วงเวลาที่เลือก" accentColor={loading ? COLOR.mid : slaColor(summary?.sla_pct ?? 0)} />
          </div>

          <Card>
            <CardTitle
              sub="คลิกตัวเลขเพื่อดูรายละเอียดเรื่องที่รับผิดชอบ · สีแดง = มีเรื่องเกิน SLA · สีเข้ม = มีภาระงานสูงกว่าค่าเฉลี่ยของทีม · แถวสีเขียวจาง = ผู้ทำ SLA ได้ดีที่สุดในฝ่าย"
              right={
                <div className="flex gap-1.5">
                  <button onClick={() => setSortBy("workload")} className="rounded-full border px-3 py-1 text-xs font-semibold"
                    style={sortBy === "workload" ? { background: COLOR.dark, color: "#fff", borderColor: COLOR.dark } : { borderColor: COLOR.border, color: COLOR.muted }}>ภาระงานสูงสุด</button>
                  <button onClick={() => setSortBy("sla_top")} className="rounded-full border px-3 py-1 text-xs font-semibold"
                    style={sortBy === "sla_top" ? { background: COLOR.green, color: "#fff", borderColor: COLOR.green } : { borderColor: COLOR.border, color: COLOR.muted }}>SLA สูงสุด</button>
                  <button onClick={() => setSortBy("sla")} className="rounded-full border px-3 py-1 text-xs font-semibold"
                    style={sortBy === "sla" ? { background: COLOR.red, color: "#fff", borderColor: COLOR.red } : { borderColor: COLOR.border, color: COLOR.muted }}>SLA ต่ำสุด</button>
                </div>
              }
            >
              ผลการปฏิบัติงานของเจ้าหน้าที่
            </CardTitle>
            {loading ? <Skeleton height={240} /> : staff.length === 0 ? (
              <div className="py-6 text-center text-gray-400">ยังไม่มีเจ้าหน้าที่{isAllDepartments ? "" : "ในฝ่ายนี้"}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                      <th className="py-2 pr-4">เจ้าหน้าที่</th><th className="py-2 pr-4">ฝ่าย</th>
                      <th className="py-2 pr-4 text-right">รับผิดชอบ</th><th className="py-2 pr-4 text-right">เสร็จสิ้น</th>
                      <th className="py-2 pr-4 text-right">ค้างดำเนินการ</th><th className="py-2 pr-4 text-right">เวลาเฉลี่ย (ชม.)</th>
                      <th className="py-2 pr-6 text-right">อัตราความสำเร็จตาม SLA</th><th className="py-2">ภาระงาน</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedStaff.map((s: any) => (
                      <StaffWorkloadTableRow key={s.user_id} s={s} maxActive={maxActive} avgActive={avgActive} deptLabel={realDeptName} isTop={s.user_id === topPerformerId} onClick={() => setSelectedStaff(s)} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Card>
              <CardTitle sub="จำนวนเรื่องร้องเรียนและอัตราความสำเร็จตาม SLA (เรียงจากมากไปน้อย)">ผลงานตามประเภทย่อย</CardTitle>
              {loading ? <Skeleton height={180} /> : topSubcatsByVolume.length === 0 ? (
                <div className="py-6 text-center text-gray-400">ไม่มีข้อมูลในช่วงเวลานี้</div>
              ) : topSubcatsByVolume.map((s: any, i: number) => <RankedStatRow key={i} rank={i + 1} name={s.subcategory} total={s.total} pct={s.sla_pct} />)}
            </Card>
            <Card>
              <CardTitle sub="แสดง 5 เขตที่มีจำนวนงานในความรับผิดชอบมากที่สุด">พื้นที่ที่ดำเนินงานมากที่สุด</CardTitle>
              {al ? <Skeleton height={180} /> : topAreas.length === 0 ? (
                <div className="py-6 text-center text-gray-400">ไม่มีข้อมูลในช่วงเวลานี้</div>
              ) : topAreas.map((a: any, i: number) => <RankedStatRow key={i} rank={i + 1} name={a.district} total={a.total} pct={a.closure_rate} metricLabel="ปิดแล้ว" />)}
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Card>
              <CardTitle sub={`จำนวนรายการในแต่ละขั้นตอนการดำเนินงาน${isAllDepartments ? "ทุกฝ่าย" : "ของฝ่ายนี้"}`}>ขั้นตอนการดำเนินงาน</CardTitle>
              {wfl ? <Skeleton height={200} /> : safeWf.length === 0 ? (
                <div className="py-6 text-center text-gray-400">ไม่มีข้อมูลในช่วงเวลานี้</div>
              ) : (
                <div className="space-y-2.5">
                  {safeWf.map((w, i) => (
                    <div key={i}>
                      <div className="mb-1 flex justify-between text-xs"><span className="text-gray-500">{w.label}</span><span className="font-semibold">{w.count?.toLocaleString()}</span></div>
                      <div className="h-2 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full" style={{ width: `${(w.count / (safeWf[0]?.count || 1)) * 100}%`, background: wfColors[i % wfColors.length] }} /></div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
            <Card>
              <CardTitle sub={`จำนวนเรื่องร้องเรียนที่รับใหม่และดำเนินการแล้ว ${trendGranularity === "day" ? "รายวัน" : trendGranularity === "week" ? "รายสัปดาห์" : "รายเดือน"} ${isAllDepartments ? "ทุกฝ่าย" : "ของฝ่ายนี้"}`}>
                {TREND_TITLE[trendGranularity]}
              </CardTitle>
              <ChartLegend items={[["รับเรื่องใหม่", COLOR.primary], ["ดำเนินการแก้ไขแล้ว", COLOR.green]]} />
              {tl ? <Skeleton height={190} /> : (
                <ResponsiveContainer width="100%" height={190}>
                  <LineChart data={safeTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke={COLOR.border} />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => v && (trendGranularity === "month" ? `${v.slice(5)}/${v.slice(2, 4)}` : v.slice(5))} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip content={<ChartTip />} />
                    <Line type="linear" dataKey="new_cases" name="รับใหม่" stroke={COLOR.primary} strokeWidth={2.5} dot={false} />
                    <Line type="linear" dataKey="done_cases" name="แก้ไขแล้ว" stroke={COLOR.green} strokeWidth={2} dot={false} strokeDasharray="5 3" />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>
        </>
      )}

      {selectedStaff && (
        <Modal onClose={() => setSelectedStaff(null)}>
          <div className="p-6">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-base font-bold">{selectedStaff.name}</span>
              <span className="text-xs text-gray-400">{selectedStaff.role}</span>
            </div>
            <div className="mb-3.5 text-xs text-gray-400">เคสที่ถืออยู่ตอนนี้ · เรียงจากใกล้/เกิน SLA มากที่สุดก่อน · ไม่ผูกกับช่วงวันที่ในหน้าหลัก</div>
            {scLoading ? <Skeleton height={200} /> : safeStaffCases.length === 0 ? (
              <div className="py-6 text-center text-gray-400">ไม่มีเคสที่ถืออยู่ตอนนี้</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-gray-200 text-left text-xs text-gray-500">{["เลขที่", "พื้นที่", "ประเภทย่อย", "สถานะ", "Priority", "เปิดมาแล้ว"].map((h) => <th key={h} className="py-2.5 pr-3">{h}</th>)}</tr></thead>
                  <tbody>
                    {safeStaffCases.map((c: any, i: number) => (
                      <tr key={i} className="border-b border-gray-100 align-top last:border-0">
                        <td className="py-3.5 pr-3 font-mono">{c.no}</td>
                        <td className="py-3.5 pr-3">{c.district}</td>
                        <td className="py-3.5 pr-3">{c.subcategory}</td>
                        <td className="py-3.5 pr-3"><Badge label={c.status} color={c.status_color} /></td>
                        <td className="py-3.5 pr-3"><Badge label={c.priority} color={c.priority_color} /></td>
                        <td className="py-3.5" style={{ color: c.is_overdue ? COLOR.red : COLOR.text, fontWeight: c.is_overdue ? 700 : 400 }}>{c.days_open} วัน{c.is_overdue ? " (เกิน SLA)" : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}