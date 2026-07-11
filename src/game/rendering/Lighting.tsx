import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { GameSettings } from "../settings";

export function Lighting({ shadowQuality, fogQuality }: { shadowQuality: GameSettings["graphics"]["shadowQuality"]; fogQuality: GameSettings["graphics"]["fogQuality"] }) {
  const sunRef = useRef<THREE.DirectionalLight>(null);
  const ambientRef = useRef<THREE.AmbientLight>(null);
  const { scene } = useThree();
  const fogNight = useMemo(() => new THREE.Color("#c7d7ee"), []);
  const fogDay = useMemo(() => new THREE.Color("#cde8ff"), []);
  const shadowSize = shadowQuality === "high" ? 2048 : shadowQuality === "medium" ? 1024 : 512;
  const fogFar = fogQuality === "high" ? 150 : fogQuality === "medium" ? 120 : 88;

  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 0.035;
    const daylight = Math.max(0.22, 0.58 + Math.sin(t) * 0.42);
    if (sunRef.current) {
      sunRef.current.position.set(Math.cos(t) * 34, Math.sin(t) * 36 + 18, 22);
      sunRef.current.intensity = 1.15 + daylight * 1.35;
    }
    if (ambientRef.current) ambientRef.current.intensity = 0.34 + daylight * 0.36;
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.lerpColors(fogNight, fogDay, daylight);
    }
  });

  return (
    <>
      <ambientLight ref={ambientRef} intensity={0.55} />
      <directionalLight ref={sunRef} position={[24, 38, 18]} intensity={2.2} castShadow={shadowQuality !== "off"} shadow-mapSize-width={shadowSize} shadow-mapSize-height={shadowSize} />
      <fog attach="fog" args={["#cde8ff", Math.max(32, fogFar * 0.36), fogFar]} />
    </>
  );
}
