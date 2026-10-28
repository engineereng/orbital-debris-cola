"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Line, OrbitControls } from "@react-three/drei";
import { useEffect, useMemo, useRef, type MutableRefObject, type RefObject } from "react";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import type { ApproachRow, EcefVec, VizArtifact } from "@/lib/types";
import {
  computeLiveNeighborhood,
  expandEcefTrack,
  primaryAtIndex,
  scrubIndexForTime,
  type LiveNeighborhoodObject,
} from "@/lib/loadArtifacts";

export type ScaleInfo = {
  /** Nice round length represented by the bar (km); world units are 1:1 km */
  labelKm: number;
  /** Pixel width of that bar at current zoom */
  barPx: number;
};

type Props = {
  viz: VizArtifact;
  delayMinutes: number;
  approaches: ApproachRow[];
  keepOutKm: number;
  selectedNoradId: string | null;
  scrubTRelSec: number;
  onSelectApproach: (noradId: string | null) => void;
  onScaleInfo?: (info: ScaleInfo) => void;
};

/** ECEF km → Three.js coords (Y-up): (x, z, -y). */
function toThree(v: EcefVec): [number, number, number] {
  return [v[0], v[2], -v[1]];
}

function framing(padEcef: EcefVec, earthRadiusKm: number) {
  const padThree = toThree(padEcef);
  const pad = new THREE.Vector3(...padThree);
  const n = pad.clone().normalize();
  const up = new THREE.Vector3(0, 1, 0);
  let east = new THREE.Vector3().crossVectors(up, n);
  if (east.lengthSq() < 1e-6) east = new THREE.Vector3(1, 0, 0);
  east.normalize();
  const north = new THREE.Vector3().crossVectors(n, east).normalize();
  const target = n.clone().multiplyScalar(earthRadiusKm + 180);
  const position = pad
    .clone()
    .add(n.clone().multiplyScalar(2200))
    .add(east.multiplyScalar(1800))
    .add(north.multiplyScalar(900));
  return {
    padThree,
    target: target.toArray() as [number, number, number],
    position: position.toArray() as [number, number, number],
  };
}

function niceScaleKm(worldWidthKm: number, targetFraction = 0.22): number {
  const target = Math.max(1, worldWidthKm * targetFraction);
  const candidates = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
  let best = candidates[0];
  for (const c of candidates) {
    if (c <= target) best = c;
  }
  return best;
}

/** Fit camera so all points are in view with padding (1 world unit = 1 km). */
function fitCameraToPoints(
  points: THREE.Vector3[],
  camera: THREE.PerspectiveCamera,
  controls: OrbitControlsImpl | null,
  padding = 1.75,
) {
  if (points.length === 0) return;
  const mid = new THREE.Vector3();
  for (const p of points) mid.add(p);
  mid.multiplyScalar(1 / points.length);

  let radius = 50;
  for (const p of points) radius = Math.max(radius, p.distanceTo(mid));
  radius = Math.max(radius * padding, 90);

  const fov = (camera.fov * Math.PI) / 180;
  const dist = radius / Math.sin(fov / 2);

  const radial = mid.clone().normalize();
  const prevTarget = controls?.target ?? mid.clone();
  let viewDir = camera.position.clone().sub(prevTarget);
  if (viewDir.lengthSq() < 1e-6) {
    let side = new THREE.Vector3().crossVectors(radial, new THREE.Vector3(0, 1, 0));
    if (side.lengthSq() < 1e-8) side = new THREE.Vector3(1, 0, 0);
    side.normalize();
    viewDir = radial.clone().multiplyScalar(0.6).add(side.multiplyScalar(0.5));
  }
  viewDir.normalize();

  const camPos = mid.clone().add(viewDir.multiplyScalar(dist));
  camera.position.copy(camPos);
  if (controls) {
    controls.target.copy(mid);
    controls.update();
  } else {
    camera.lookAt(mid);
  }
}

function Earth({ radius }: { radius: number }) {
  return (
    <mesh>
      <sphereGeometry args={[radius, 64, 48]} />
      <meshStandardMaterial
        color="#1a4a5c"
        roughness={0.92}
        metalness={0.08}
        transparent
        opacity={0.92}
      />
    </mesh>
  );
}

function Atmosphere({ radius }: { radius: number }) {
  return (
    <mesh>
      <sphereGeometry args={[radius * 1.012, 48, 32]} />
      <meshBasicMaterial
        color="#7eb8c9"
        transparent
        opacity={0.07}
        side={THREE.BackSide}
        depthWrite={false}
      />
    </mesh>
  );
}

function PadMarker({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[45, 16, 16]} />
        <meshStandardMaterial color="#0e2433" emissive="#0e2433" emissiveIntensity={0.2} />
      </mesh>
      <mesh position={[0, 80, 0]}>
        <coneGeometry args={[28, 90, 8]} />
        <meshStandardMaterial color="#c45c26" />
      </mesh>
    </group>
  );
}

function PrimaryPath({ points }: { points: [number, number, number][] }) {
  if (points.length < 2) return null;
  return (
    <Line
      points={points}
      color="#3aa0c0"
      lineWidth={1.75}
      transparent
      opacity={0.28}
    />
  );
}

function VelocityArrow({
  origin,
  vel,
  color,
  scaleKm = 180,
}: {
  origin: EcefVec;
  vel: EcefVec;
  color: string;
  scaleKm?: number;
}) {
  const speed = Math.hypot(vel[0], vel[1], vel[2]);
  if (speed < 1e-6) return null;
  const dir: EcefVec = [vel[0] / speed, vel[1] / speed, vel[2] / speed];
  const len = scaleKm;
  const tip: EcefVec = [
    origin[0] + dir[0] * len,
    origin[1] + dir[1] * len,
    origin[2] + dir[2] * len,
  ];
  const mid: EcefVec = [
    origin[0] + dir[0] * len * 0.82,
    origin[1] + dir[1] * len * 0.82,
    origin[2] + dir[2] * len * 0.82,
  ];
  const o3 = toThree(origin);
  const t3 = toThree(tip);
  const m3 = toThree(mid);
  const quat = new THREE.Quaternion();
  const from = new THREE.Vector3(0, 1, 0);
  const to = new THREE.Vector3(t3[0] - o3[0], t3[1] - o3[1], t3[2] - o3[2]).normalize();
  quat.setFromUnitVectors(from, to);

  return (
    <group>
      <Line points={[o3, t3]} color={color} lineWidth={2} />
      <mesh position={m3} quaternion={quat}>
        <coneGeometry args={[22, 70, 8]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.25} />
      </mesh>
    </group>
  );
}

function LiveSecondary({
  obj,
  primaryEcef,
  selected,
  dimmed,
  onSelect,
}: {
  obj: LiveNeighborhoodObject;
  primaryEcef: EcefVec;
  selected: boolean;
  dimmed: boolean;
  onSelect: () => void;
}) {
  const sec = toThree(obj.ecef);
  const pri = toThree(primaryEcef);
  const r = selected ? 55 : obj.breach ? 40 : 28;
  const color = obj.breach ? "#c45c26" : "#2f7d4a";

  return (
    <group>
      {(selected || obj.breach) && (
        <Line
          points={[pri, sec]}
          color={obj.breach ? "#c45c26" : "#7eb8c9"}
          lineWidth={selected ? 2.25 : 1.25}
          dashed={!selected}
          dashSize={40}
          gapSize={30}
          transparent
          opacity={dimmed ? 0.1 : selected ? 0.95 : 0.5}
        />
      )}
      <mesh
        position={sec}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        onPointerOver={() => {
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          document.body.style.cursor = "auto";
        }}
      >
        <sphereGeometry args={[r, 16, 16]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={selected ? 0.55 : obj.breach ? 0.3 : 0.08}
          transparent
          opacity={dimmed ? 0.16 : 1}
          roughness={0.45}
        />
      </mesh>
      {!dimmed && (
        <VelocityArrow origin={obj.ecef} vel={obj.vel} color={color} scaleKm={140} />
      )}
    </group>
  );
}

/** Reports visible scale (km) at current zoom — 1 world unit = 1 km. */
function ScaleReporter({
  controlsRef,
  onScaleInfo,
}: {
  controlsRef: RefObject<OrbitControlsImpl | null>;
  onScaleInfo?: (info: ScaleInfo) => void;
}) {
  const { camera, size } = useThree();
  const lastKey = useRef("");

  useFrame(() => {
    if (!onScaleInfo) return;
    const cam = camera as THREE.PerspectiveCamera;
    const controls = controlsRef.current;
    const target = controls?.target ?? new THREE.Vector3(0, 0, 0);
    const dist = cam.position.distanceTo(target);
    if (!Number.isFinite(dist) || dist < 1e-3) return;
    const vFov = (cam.fov * Math.PI) / 180;
    const worldHeight = 2 * Math.tan(vFov / 2) * dist;
    const worldWidth = worldHeight * (size.width / Math.max(size.height, 1));
    const labelKm = niceScaleKm(worldWidth);
    const barPx = Math.max(24, Math.min(220, (labelKm / worldWidth) * size.width));
    const key = `${labelKm}:${Math.round(barPx)}`;
    if (key === lastKey.current) return;
    lastKey.current = key;
    onScaleInfo({ labelKm, barPx });
  });

  return null;
}

function CameraRig({
  defaultPosition,
  defaultTarget,
  earthRadiusKm,
  primaryEcef,
  focusEcef,
  scrubTRelSec,
  controlsRef,
}: {
  defaultPosition: [number, number, number];
  defaultTarget: [number, number, number];
  earthRadiusKm: number;
  primaryEcef: EcefVec | null;
  focusEcef: EcefVec | null;
  scrubTRelSec: number;
  controlsRef: MutableRefObject<OrbitControlsImpl | null>;
}) {
  const { camera } = useThree();

  // Seed a pad-looking pose before first fit (delay remount)
  useEffect(() => {
    camera.position.set(...defaultPosition);
    camera.lookAt(...defaultTarget);
    camera.updateProjectionMatrix();
  }, [camera, defaultPosition, defaultTarget]);

  // Scrub / select: frame primary @ t, or primary+selected secondary pair
  useEffect(() => {
    const points: THREE.Vector3[] = [];
    if (primaryEcef) points.push(new THREE.Vector3(...toThree(primaryEcef)));
    if (focusEcef) points.push(new THREE.Vector3(...toThree(focusEcef)));
    if (points.length === 0) {
      points.push(new THREE.Vector3(...defaultTarget));
    }
    const apply = () =>
      fitCameraToPoints(
        points,
        camera as THREE.PerspectiveCamera,
        controlsRef.current,
        focusEcef ? 1.85 : 2.1,
      );
    apply();
    const id = requestAnimationFrame(apply);
    return () => cancelAnimationFrame(id);
  }, [
    scrubTRelSec,
    primaryEcef,
    focusEcef,
    camera,
    controlsRef,
    defaultTarget,
  ]);

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enablePan
      minDistance={earthRadiusKm * 0.06}
      maxDistance={earthRadiusKm * 6}
      target={defaultTarget}
    />
  );
}

function SceneContents({
  viz,
  delayMinutes,
  approaches,
  keepOutKm,
  selectedNoradId,
  scrubTRelSec,
  onSelectApproach,
  onScaleInfo,
}: Props) {
  const entry = viz.byDelayMinutes[String(delayMinutes)];
  const { padThree, target, position } = useMemo(
    () => framing(viz.pad.ecef, viz.earthRadiusKm),
    [viz.pad.ecef, viz.earthRadiusKm],
  );
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  const trackPts = useMemo(() => {
    if (!entry) return [] as [number, number, number][];
    return expandEcefTrack(entry.primaryEcef).map((p) => toThree(p.ecef));
  }, [entry]);

  const scrubIdx = entry
    ? scrubIndexForTime(entry.primaryEcef, scrubTRelSec)
    : 0;
  const primary = entry ? primaryAtIndex(entry.primaryEcef, scrubIdx) : null;

  const liveObjects = useMemo(
    () =>
      computeLiveNeighborhood(
        viz,
        delayMinutes,
        approaches,
        scrubTRelSec,
        keepOutKm,
      ),
    [viz, delayMinutes, approaches, scrubTRelSec, keepOutKm],
  );

  const selectedLive = useMemo(
    () => liveObjects.find((o) => o.noradId === selectedNoradId) ?? null,
    [liveObjects, selectedNoradId],
  );

  return (
    <>
      <color attach="background" args={["#0b2833"]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[8000, 12000, 4000]} intensity={1.15} />
      <directionalLight position={[-6000, -2000, -8000]} intensity={0.25} />

      <Earth radius={viz.earthRadiusKm} />
      <Atmosphere radius={viz.earthRadiusKm} />
      <PadMarker position={padThree} />
      <PrimaryPath points={trackPts} />

      {primary && (
        <group>
          <mesh position={toThree(primary.ecef)}>
            <sphereGeometry args={[48, 16, 16]} />
            <meshStandardMaterial
              color="#f3f6f4"
              emissive="#1f6f8b"
              emissiveIntensity={0.45}
            />
          </mesh>
          <VelocityArrow
            origin={primary.ecef}
            vel={primary.vel}
            color="#3aa0c0"
            scaleKm={220}
          />
        </group>
      )}

      {liveObjects.map((obj) => {
        const selected = obj.noradId === selectedNoradId;
        const dimmed = selectedNoradId != null && !selected;
        return (
          <LiveSecondary
            key={obj.noradId}
            obj={obj}
            primaryEcef={primary!.ecef}
            selected={selected}
            dimmed={dimmed}
            onSelect={() => onSelectApproach(selected ? null : obj.noradId)}
          />
        );
      })}

      <CameraRig
        defaultPosition={position}
        defaultTarget={target}
        earthRadiusKm={viz.earthRadiusKm}
        primaryEcef={primary?.ecef ?? null}
        focusEcef={selectedLive?.ecef ?? null}
        scrubTRelSec={scrubTRelSec}
        controlsRef={controlsRef}
      />
      <ScaleReporter controlsRef={controlsRef} onScaleInfo={onScaleInfo} />
    </>
  );
}

export function TrajectoryScene(props: Props) {
  return (
    <Canvas
      className="viz-canvas"
      dpr={[1, 1.75]}
      camera={{
        fov: 42,
        near: 1,
        far: props.viz.earthRadiusKm * 20,
      }}
      onPointerMissed={() => props.onSelectApproach(null)}
      gl={{ antialias: true, alpha: false }}
    >
      <SceneContents key={props.delayMinutes} {...props} />
    </Canvas>
  );
}
