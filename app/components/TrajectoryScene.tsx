"use client";

import { Canvas, useThree } from "@react-three/fiber";
import { Line, OrbitControls } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { ApproachRow, EcefVec, VizArtifact } from "@/lib/types";
import { expandEcefTrack } from "@/lib/loadArtifacts";

type Props = {
  viz: VizArtifact;
  delayMinutes: number;
  approaches: ApproachRow[];
  keepOutKm: number;
  selectedNoradId: string | null;
  onSelectApproach: (noradId: string | null) => void;
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
      lineWidth={2.75}
      transparent
      opacity={0.98}
    />
  );
}

function NeighborhoodObject({
  row,
  keepOutKm,
  selected,
  dimmed,
  onSelect,
}: {
  row: ApproachRow;
  keepOutKm: number;
  selected: boolean;
  dimmed: boolean;
  onSelect: () => void;
}) {
  if (!row.secondaryEcef || !row.primaryEcef) return null;
  const breach = row.missKm < keepOutKm;
  const sec = toThree(row.secondaryEcef);
  const pri = toThree(row.primaryEcef);
  const r = selected ? 55 : breach ? 38 : 28;
  const color = breach ? "#c45c26" : "#2f7d4a";

  return (
    <group>
      {(selected || breach) && (
        <Line
          points={[pri, sec]}
          color={breach ? "#c45c26" : "#7eb8c9"}
          lineWidth={selected ? 2.25 : 1.25}
          dashed={!selected}
          dashSize={40}
          gapSize={30}
          transparent
          opacity={dimmed ? 0.12 : selected ? 0.95 : 0.55}
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
          emissiveIntensity={selected ? 0.55 : breach ? 0.28 : 0.08}
          transparent
          opacity={dimmed ? 0.18 : 1}
          roughness={0.45}
        />
      </mesh>
      {selected && (
        <mesh position={pri}>
          <sphereGeometry args={[32, 12, 12]} />
          <meshStandardMaterial
            color="#f3f6f4"
            emissive="#1f6f8b"
            emissiveIntensity={0.35}
            transparent
            opacity={0.95}
          />
        </mesh>
      )}
    </group>
  );
}

function CameraRig({
  position,
  target,
  earthRadiusKm,
}: {
  position: [number, number, number];
  target: [number, number, number];
  earthRadiusKm: number;
}) {
  const { camera } = useThree();
  useEffect(() => {
    camera.position.set(...position);
    camera.lookAt(...target);
    camera.updateProjectionMatrix();
  }, [camera, position, target]);

  return (
    <OrbitControls
      makeDefault
      enablePan
      minDistance={earthRadiusKm * 0.12}
      maxDistance={earthRadiusKm * 6}
      target={target}
    />
  );
}

function SceneContents({
  viz,
  delayMinutes,
  approaches,
  keepOutKm,
  selectedNoradId,
  onSelectApproach,
}: Props) {
  const entry = viz.byDelayMinutes[String(delayMinutes)];
  const { padThree, target, position } = useMemo(
    () => framing(viz.pad.ecef, viz.earthRadiusKm),
    [viz.pad.ecef, viz.earthRadiusKm],
  );

  const trackPts = useMemo(() => {
    if (!entry) return [] as [number, number, number][];
    return expandEcefTrack(entry.primaryEcef).map((p) => toThree(p.ecef));
  }, [entry]);

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

      {approaches.map((row) => {
        const selected = row.noradId === selectedNoradId;
        const dimmed = selectedNoradId != null && !selected;
        return (
          <NeighborhoodObject
            key={row.noradId}
            row={row}
            keepOutKm={keepOutKm}
            selected={selected}
            dimmed={dimmed}
            onSelect={() => onSelectApproach(selected ? null : row.noradId)}
          />
        );
      })}

      <CameraRig
        position={position}
        target={target}
        earthRadiusKm={viz.earthRadiusKm}
      />
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
      {/* Remount camera framing when delay changes so OrbitControls resets gently */}
      <SceneContents key={props.delayMinutes} {...props} />
    </Canvas>
  );
}
