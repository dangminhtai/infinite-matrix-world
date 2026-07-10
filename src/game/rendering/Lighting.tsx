import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

export function Lighting() {
  const sunRef = useRef<THREE.DirectionalLight>(null);
  const ambientRef = useRef<THREE.AmbientLight>(null);
  const { scene } = useThree();
  const fogNight = useMemo(() => new THREE.Color("#c7d7ee"), []);
  const fogDay = useMemo(() => new THREE.Color("#cde8ff"), []);

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
      <directionalLight ref={sunRef} position={[24, 38, 18]} intensity={2.2} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} />
      <fog attach="fog" args={["#cde8ff", 48, 132]} />
    </>
  );
}
