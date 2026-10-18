import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Activity, AlertTriangle, ArrowUpRight, Check, RotateCcw, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Mesh, QuadraticBezierCurve3, Vector3, type MeshBasicMaterial, type MeshStandardMaterial } from "three";
import { OrbitControls as ThreeOrbitControls } from "three/addons/controls/OrbitControls.js";
import { Card, CardBody, CardHeader } from "@/components/common/Card";
import { Skeleton } from "@/components/common/States";
import { approvalsQueryOptions, activityQueryOptions } from "@/lib/api/resources";
import { teamNetworkWorkItemsQueryOptions } from "@/lib/api/work-items";
import type { ActivityRecordData, DashboardData, TeamWorkload } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { getNetworkSignal, networkNodeSize, networkPosition, recentActivityIntensity, type NetworkSignal } from "./network-model";

type NetworkNode = { team: TeamWorkload; position: [number, number, number]; signal: NetworkSignal; load: number; size: number; intensity: number; recentActivity: number; overdue: number; unavailable: boolean };

const SIGNAL_COLOR: Record<NetworkSignal, string> = { healthy: "#61d7e4", attention: "#f0b655", critical: "#f16d6d" };
const SIGNAL_LABEL: Record<NetworkSignal, string> = { healthy: "Nominal", attention: "Attention", critical: "Critical" };

function NetworkLine({ points, color, opacity }: { points: Vector3[]; color: string; opacity: number }) {
  const positions = useMemo(() => new Float32Array(points.flatMap((point) => [point.x, point.y, point.z])), [points]);
  return <line><bufferGeometry><bufferAttribute attach="attributes-position" args={[positions, 3]} /></bufferGeometry><lineBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} /></line>;
}

function OrbitControlLayer({ reducedMotion }: { reducedMotion: boolean }) {
  const { camera, gl, invalidate } = useThree();
  useEffect(() => {
    const controls = new ThreeOrbitControls(camera, gl.domElement);
    controls.enableDamping = !reducedMotion;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.enableZoom = true;
    controls.minDistance = 3.5;
    controls.maxDistance = 6;
    controls.minPolarAngle = 0.2;
    controls.maxPolarAngle = Math.PI - 0.2;
    controls.autoRotate = false;
    const handleChange = () => invalidate();
    controls.addEventListener("change", handleChange);
    controls.update();
    return () => { controls.removeEventListener("change", handleChange); controls.dispose(); };
  }, [camera, gl.domElement, invalidate, reducedMotion]);
  return null;
}

function TeamMarker({ node, active, reducedMotion, onSelect }: { node: NetworkNode; active: boolean; reducedMotion: boolean; onSelect: () => void }) {
  const marker = useRef<Mesh>(null);
  const halo = useRef<Mesh>(null);
  const markerMaterial = useRef<MeshStandardMaterial>(null);
  const haloMaterial = useRef<MeshBasicMaterial>(null);
  const color = SIGNAL_COLOR[node.signal] ?? SIGNAL_COLOR.healthy;

  useFrame(({ clock }) => {
    const pulse = reducedMotion ? 0 : Math.sin(clock.elapsedTime * 1.35 + node.position[1] * 4) * (0.035 + node.intensity * 0.045);
    if (marker.current) marker.current.scale.setScalar((active ? 1.16 : 1) + pulse);
    if (halo.current) halo.current.scale.setScalar((active ? 1.9 : 1.55) + pulse * 1.5);
    if (markerMaterial.current) markerMaterial.current.emissiveIntensity = (active ? 1.4 : 0.8) + Math.max(0, pulse) * 4;
    if (haloMaterial.current) haloMaterial.current.opacity = (active ? 0.25 : 0.13) + Math.max(0, pulse) * 0.4;
  });

  return (
    <group position={node.position} onClick={(event) => { event.stopPropagation(); onSelect(); }} onPointerOver={() => { document.body.style.cursor = "pointer"; }} onPointerOut={() => { document.body.style.cursor = ""; }}>
      <mesh ref={halo}>
        <sphereGeometry args={[node.size * 1.65, 12, 12]} />
        <meshBasicMaterial ref={haloMaterial} color={color} transparent opacity={0.16} depthWrite={false} />
      </mesh>
      <mesh ref={marker}>
        <sphereGeometry args={[node.size, 16, 16]} />
        <meshStandardMaterial ref={markerMaterial} color={color} emissive={color} emissiveIntensity={1} toneMapped={false} roughness={0.26} metalness={0.12} />
      </mesh>
    </group>
  );
}

function GlobeGrid() {
  const paths = useMemo(() => {
    const output: Vector3[][] = [];
    const radius = 1.46;
    for (let i = -3; i <= 3; i += 1) {
      const latitude = (i * Math.PI) / 8;
      const ring: Vector3[] = [];
      for (let step = 0; step <= 48; step += 1) {
        const longitude = (step / 48) * Math.PI * 2;
        ring.push(new Vector3(radius * Math.cos(latitude) * Math.cos(longitude), radius * Math.sin(latitude), radius * Math.cos(latitude) * Math.sin(longitude)));
      }
      output.push(ring);
    }
    for (let i = 0; i < 12; i += 1) {
      const longitude = (i / 12) * Math.PI * 2;
      const meridian: Vector3[] = [];
      for (let step = 0; step <= 48; step += 1) {
        const latitude = (step / 48) * Math.PI - Math.PI / 2;
        meridian.push(new Vector3(radius * Math.cos(latitude) * Math.cos(longitude), radius * Math.sin(latitude), radius * Math.cos(latitude) * Math.sin(longitude)));
      }
      output.push(meridian);
    }
    return output;
  }, []);
  return <>{paths.map((points, index) => <NetworkLine key={index} points={points} color="#65bdd2" opacity={index < 7 ? 0.2 : 0.12} />)}</>;
}

function NetworkConnections({ nodes }: { nodes: NetworkNode[] }) {
  const routes = useMemo(() => nodes.map((node, index) => {
    const next = nodes[(index + 1) % nodes.length];
    const start = new Vector3(...node.position);
    const end = new Vector3(...(next?.position ?? node.position));
    const control = start.clone().add(end).normalize().multiplyScalar(1.9);
    return new QuadraticBezierCurve3(start, control, end).getPoints(32);
  }), [nodes]);
  return <>{routes.map((points, index) => <NetworkLine key={index} points={points} color="#5abbd0" opacity={0.27} />)}</>;
}

function NetworkScene({ nodes, selectedId, reducedMotion, onSelect }: { nodes: NetworkNode[]; selectedId: string; reducedMotion: boolean; onSelect: (id: string) => void }) {
  return (
    <>
      <ambientLight intensity={1.3} />
      <pointLight position={[3, 2, 4]} intensity={10} color="#79d7e7" distance={9} />
      <pointLight position={[-3, -2, -3]} intensity={4} color="#3759a2" distance={8} />
      <mesh>
        <sphereGeometry args={[1.44, 40, 28]} />
        <meshStandardMaterial color="#12233a" emissive="#071421" emissiveIntensity={0.65} metalness={0.24} roughness={0.74} />
      </mesh>
      <mesh scale={1.045}>
        <sphereGeometry args={[1.44, 32, 20]} />
        <meshBasicMaterial color="#3f91b2" transparent opacity={0.055} side={2} depthWrite={false} />
      </mesh>
      <GlobeGrid />
      <NetworkConnections nodes={nodes} />
      {nodes.map((node) => <TeamMarker key={node.team.teamId} node={node} active={selectedId === node.team.teamId} reducedMotion={reducedMotion} onSelect={() => onSelect(node.team.teamId)} />)}
      <OrbitControlLayer reducedMotion={reducedMotion} />
    </>
  );
}

function TopologyFallback({ nodes, selectedId, onSelect }: { nodes: NetworkNode[]; selectedId: string; onSelect: (id: string) => void }) {
  const positions = nodes.map((node, index) => {
    const angle = (index / Math.max(nodes.length, 1)) * Math.PI * 2 - Math.PI / 2;
    return { node, x: 50 + Math.cos(angle) * 34, y: 50 + Math.sin(angle) * 34 };
  });
  return (
    <div className="topology-fallback" role="group" aria-label="Two-dimensional team topology. Select a team node to view its operations.">
      <svg aria-hidden="true" viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
        <circle cx="50" cy="50" r="34" fill="none" stroke="currentColor" strokeOpacity=".13" strokeDasharray="1.2 1.2" />
        <circle cx="50" cy="50" r="21" fill="none" stroke="currentColor" strokeOpacity=".1" />
        {positions.map(({ node, x, y }) => <line key={node.team.teamId} x1="50" y1="50" x2={x} y2={y} stroke={SIGNAL_COLOR[node.signal]} strokeOpacity=".3" strokeWidth=".35" />)}
      </svg>
      <div className="topology-core"><Activity className="h-5 w-5" /><span>NETWORK</span></div>
      {positions.map(({ node, x, y }) => <button key={node.team.teamId} type="button" aria-label={`${node.team.team} team, ${SIGNAL_LABEL[node.signal]}`} aria-pressed={selectedId === node.team.teamId} title={`${node.team.team} · ${SIGNAL_LABEL[node.signal]}`} onClick={() => onSelect(node.team.teamId)} className="topology-point" style={{ left: `${x}%`, top: `${y}%`, "--node-color": SIGNAL_COLOR[node.signal] } as CSSProperties}><span style={{ height: `${6 + node.load * 4}px`, width: `${6 + node.load * 4}px` }} /></button>)}
      <p className="absolute bottom-2 left-0 right-0 text-center font-mono text-[9px] uppercase tracking-widest text-muted-foreground">WebGL unavailable · 2D topology active</p>
    </div>
  );
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return reduced;
}

function ActivityRows({ events, isPending, error }: { events: ActivityRecordData[] | undefined; isPending: boolean; error: Error | null }) {
  if (isPending) return <div className="space-y-2">{[0, 1].map((item) => <Skeleton key={item} className="h-10" />)}</div>;
  if (error) return <p role="alert" className="rounded-lg border border-destructive/25 bg-destructive/5 p-2.5 text-xs text-destructive">Recent activity could not be loaded for this team.</p>;
  if (!events?.length) return <p className="rounded-lg border border-dashed border-border/70 px-3 py-4 text-center text-xs text-muted-foreground">No recorded activity for this team yet.</p>;
  return <ul className="space-y-2.5">
    {events.slice(0, 3).map((event) => <li key={event.id} className="flex gap-2.5 text-xs"><span className={cn("mt-1 h-1.5 w-1.5 shrink-0 rounded-full", event.kind === "approved" ? "bg-success" : event.kind === "created" ? "bg-primary" : "bg-muted-foreground")} /><span className="min-w-0 flex-1"><span className="font-medium">{event.actor}</span><span className="text-muted-foreground"> {event.action}</span><span className="mt-0.5 block truncate text-[10px] text-muted-foreground/70">{event.work_item?.key ?? "Team event"} · {event.work_item?.title ?? "Operational change"}</span></span><time className="shrink-0 font-mono text-[9px] text-muted-foreground">{new Date(event.occurred_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></li>)}
  </ul>;
}

function TeamDetails({ node }: { node: NetworkNode }) {
  const teamId = node.team.teamId;
  const work = useQuery(teamNetworkWorkItemsQueryOptions(teamId));
  const approvals = useQuery(approvalsQueryOptions(teamId));
  const activity = useQuery(activityQueryOptions(teamId, 0));
  const activeItems = (work.data ?? []).filter((item) => item.status !== "done").slice(0, 4);
  const active = node.team.open + node.team.inProgress;
  const ratio = node.team.capacity > 0 ? Math.min(1, active / node.team.capacity) : 0;

  return (
    <aside className="network-detail" aria-label={`${node.team.team} team details`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0"><p className="font-mono text-[9px] uppercase tracking-[0.17em] text-muted-foreground">Selected team</p><h3 className="mt-1 truncate text-base font-semibold">{node.team.team}</h3></div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-1 text-[9px] font-medium" style={{ color: SIGNAL_COLOR[node.signal], borderColor: `${SIGNAL_COLOR[node.signal]}55`, background: `${SIGNAL_COLOR[node.signal]}12` }}><span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: SIGNAL_COLOR[node.signal] }} />{SIGNAL_LABEL[node.signal]}</span>
      </div>
      {node.unavailable && <p role="status" className="mt-3 text-[10px] text-warning">Work-item signal is still loading or unavailable. Capacity status is shown until records arrive.</p>}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Metric label="Open work" value={node.team.open} signal="neutral" />
        <Metric label="Underway" value={node.team.inProgress} signal="cyan" />
        <Metric label="Approvals" value={approvals.isPending ? "…" : approvals.data?.length ?? "—"} signal="amber" />
        <Metric label="Overdue observed" value={work.isPending ? "…" : node.overdue} signal="red" />
        <Metric label="Activity · 7d" value={node.unavailable ? "—" : node.recentActivity} signal="cyan" />
      </div>
      <div className="mt-4 rounded-lg border border-border/60 bg-background/25 p-3">
        <div className="flex items-center justify-between gap-2 text-[10px]"><span className="text-muted-foreground">Reported capacity</span><span className="font-mono tabular">{active} / {node.team.capacity || "—"}</span></div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-background"><div className="h-full rounded-full transition-all" style={{ width: `${ratio * 100}%`, backgroundColor: SIGNAL_COLOR[node.signal] }} /></div>
      </div>
      {work.error && <p role="alert" className="mt-3 text-[10px] text-destructive">Could not retrieve this team’s work-item detail.</p>}
      {approvals.error && <p role="alert" className="mt-2 text-[10px] text-destructive">Approval detail is unavailable.</p>}
      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between"><p className="font-mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground">Recent active work</p><span className="text-[9px] text-muted-foreground">up to 4</span></div>
        {work.isPending ? <div className="space-y-2">{[0, 1].map((item) => <Skeleton key={item} className="h-8" />)}</div> : activeItems.length ? <ul className="space-y-1.5">{activeItems.map((item) => <li key={item.id} className="flex items-center gap-2 rounded-md border border-border/50 bg-white/[0.02] px-2.5 py-2"><span className="min-w-0 flex-1 truncate text-[10px] font-medium" title={item.title}>{item.title}</span><span className="shrink-0 font-mono text-[9px] text-muted-foreground">{item.key}</span></li>)}</ul> : <p className="rounded-md border border-dashed border-border/70 px-2.5 py-3 text-center text-[10px] text-muted-foreground">No active items in the returned work list.</p>}
      </div>
      <div className="mt-4 border-t border-border/60 pt-3">
        <div className="mb-2 flex items-center gap-1.5"><Activity className="h-3 w-3 text-primary" /><p className="font-mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground">Recent activity</p></div>
        <ActivityRows events={activity.data} isPending={activity.isPending} error={activity.error} />
      </div>
      {approvals.data && approvals.data.length > 0 && <p className="mt-3 flex items-center gap-1.5 text-[10px] text-warning"><AlertTriangle className="h-3 w-3" />{approvals.data.length} item{approvals.data.length === 1 ? "" : "s"} awaiting an authorized decision.</p>}
    </aside>
  );
}

function Metric({ label, value, signal }: { label: string; value: string | number; signal: NetworkSignal | "cyan" | "amber" | "red" | "neutral" }) {
  const color = signal === "healthy" || signal === "cyan" ? SIGNAL_COLOR["healthy"] : signal === "attention" || signal === "amber" ? SIGNAL_COLOR["attention"] : signal === "critical" || signal === "red" ? SIGNAL_COLOR["critical"] : "#c4d1dc";
  return <div className="rounded-lg border border-border/60 bg-background/30 px-2.5 py-2"><p className="font-mono text-[8px] uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-1 font-mono text-xl tabular" style={{ color }}>{value}</p></div>;
}

export default function GlobalOperationsNetwork({ data }: { data: DashboardData }) {
  const reducedMotion = useReducedMotion();
  const allTeams = data.teams;
  const teams = allTeams;
  const itemQueries = useQueries({ queries: teams.map((team) => teamNetworkWorkItemsQueryOptions(team.teamId)) });
  const activityQueries = useQueries({ queries: teams.map((team) => activityQueryOptions(team.teamId, 0)) });
  const [selectedId, setSelectedId] = useState(teams[0]?.teamId ?? "");
  const [viewRevision, setViewRevision] = useState(0);
  const nodeButtons = useRef<Array<HTMLButtonElement | null>>([]);
  const selected = allTeams.find((team) => team.teamId === selectedId) ?? allTeams[0];

  useEffect(() => {
    if (!allTeams.some((team) => team.teamId === selectedId)) setSelectedId(allTeams[0]?.teamId ?? "");
  }, [selectedId, allTeams]);

  const nodes = useMemo(() => teams.map((team, index) => {
    const workQuery = itemQueries[index];
    const activityQuery = activityQueries[index];
    const reading = getNetworkSignal(team, workQuery?.data, Boolean(workQuery?.error || activityQuery?.error));
    const activity = activityQuery?.data;
    const recentActivity = (activity ?? []).filter((event) => Date.now() - Date.parse(event.occurred_at) <= 7 * 24 * 60 * 60 * 1000).length;
    const intensity = recentActivityIntensity(activity);
    return { team, position: networkPosition(index, teams.length), ...reading, size: networkNodeSize(reading.load, reading.signal), intensity, recentActivity, unavailable: Boolean(workQuery?.error || activityQuery?.error) };
  }), [teams, itemQueries, activityQueries]);

  function handleNodeKeys(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Home") { event.preventDefault(); setViewRevision((revision) => revision + 1); return; }
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const focused = nodeButtons.current.indexOf(document.activeElement as HTMLButtonElement);
    const current = focused >= 0 ? focused : Math.max(0, nodes.findIndex((node) => node.team.teamId === selected?.teamId));
    const next = (current + (event.key === "ArrowRight" ? 1 : nodes.length - 1)) % Math.max(nodes.length, 1);
    const target = nodes[next];
    if (target) { setSelectedId(target.team.teamId); nodeButtons.current[next]?.focus(); }
  }

  if (allTeams.length === 0) {
    return <Card><CardHeader title="Global Operations Network" description="Team-scoped operational topology" /><CardBody><p className="py-10 text-center text-sm text-muted-foreground">No team nodes are available for your account.</p></CardBody></Card>;
  }

  const selectedNode = nodes.find((node) => node.team.teamId === selected?.teamId);
  return (
    <Card className="overflow-hidden">
      <CardHeader title="Global Operations Network" description="Team workload and operational signals · illustrative topology, not geographic coordinates" action={<span className="hidden items-center gap-1.5 rounded-full border border-primary/20 bg-primary/[0.06] px-2.5 py-1 font-mono text-[9px] uppercase tracking-wider text-primary sm:inline-flex"><Users className="h-3 w-3" />{teams.length} accessible teams</span>} />
      <div className="grid lg:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.55fr)]">
        <section className="min-w-0 border-b border-border/60 p-4 sm:p-5 lg:border-b-0 lg:border-r" aria-label="Interactive operations topology">
          <div className="network-stage relative h-[300px] overflow-hidden rounded-xl border border-primary/10 sm:h-[360px] lg:h-[390px]">
            <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-md border border-border/60 bg-background/75 px-2 py-1 font-mono text-[8px] uppercase tracking-[0.14em] text-muted-foreground backdrop-blur">Team network · no geographic coordinates</div>
            <div className="pointer-events-none absolute right-3 top-3 z-10 flex gap-2.5 rounded-md border border-border/60 bg-background/75 px-2 py-1 font-mono text-[8px] uppercase tracking-wider text-muted-foreground backdrop-blur"><span className="flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full bg-[#61d7e4]" />Nominal</span><span className="flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full bg-[#f0b655]" />Attention</span><span className="flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full bg-[#f16d6d]" />Critical</span></div>
            <Canvas key={viewRevision} aria-label="Interactive 3D globe showing team operational signals" camera={{ position: [0, 0, 4.6], fov: 42 }} dpr={[1, 1.35]} gl={{ antialias: true, alpha: true, powerPreference: "low-power" }} frameloop={reducedMotion ? "demand" : "always"} fallback={<TopologyFallback nodes={nodes} selectedId={selected?.teamId ?? ""} onSelect={setSelectedId} />}>
              <NetworkScene nodes={nodes} selectedId={selected?.teamId ?? ""} reducedMotion={reducedMotion} onSelect={setSelectedId} />
            </Canvas>
            <button type="button" onClick={() => setViewRevision((revision) => revision + 1)} className="absolute bottom-3 right-3 z-10 inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/70 bg-background/80 px-2.5 text-[10px] text-muted-foreground backdrop-blur transition-colors hover:border-primary/40 hover:text-foreground" aria-label="Reset network view"><RotateCcw className="h-3 w-3" />Reset view</button>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="font-mono text-[9px] text-muted-foreground">Drag to orbit · scroll to zoom · arrow keys select a team · Home resets view</p>
            {reducedMotion && <span className="font-mono text-[8px] uppercase tracking-wider text-muted-foreground">Reduced motion</span>}
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Select a team node" onKeyDown={handleNodeKeys}>
            {nodes.map((node, index) => <button ref={(element) => { nodeButtons.current[index] = element; }} key={node.team.teamId} type="button" aria-pressed={selected?.teamId === node.team.teamId} onFocus={() => setSelectedId(node.team.teamId)} onClick={() => setSelectedId(node.team.teamId)} className={cn("inline-flex shrink-0 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[10px] transition-all focus-visible:ring-2 focus-visible:ring-ring", selected?.teamId === node.team.teamId ? "border-primary/45 bg-primary/10 text-foreground" : "border-border/60 bg-background/25 text-muted-foreground hover:border-border hover:text-foreground")}><span className="h-1.5 w-1.5 rounded-full" style={{ background: SIGNAL_COLOR[node.signal] }} />{node.team.team}</button>)}
          </div>
        </section>
        <div className="min-w-0 bg-background/15 p-4 sm:p-5">
          {selectedNode ? <TeamDetails node={selectedNode} /> : <div className="flex h-full min-h-64 items-center justify-center text-xs text-muted-foreground">Select a team node to inspect operations.</div>}
          <div className="mt-4 flex items-start gap-2 border-t border-border/60 pt-3 text-[9px] leading-relaxed text-muted-foreground"><Check className="mt-0.5 h-3 w-3 shrink-0 text-success" /><span>Team records, approvals, and audit events are loaded through existing authorized endpoints. Node positions are illustrative, not real site locations.</span></div>
        </div>
      </div>
    </Card>
  );
}
