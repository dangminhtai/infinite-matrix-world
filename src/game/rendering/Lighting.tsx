import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import type { GameSettings } from "../settings";
import type { GameState } from "../GameCanvas";

export function Lighting({ shadowQuality, fogQuality, player }: { shadowQuality: GameSettings["graphics"]["shadowQuality"]; fogQuality: GameSettings["graphics"]["fogQuality"]; player: MutableRefObject<GameState> }) {
  const sunRef = useRef<THREE.DirectionalLight>(null);
  const targetRef = useRef<THREE.Object3D>(null);
  const ambientRef = useRef<THREE.AmbientLight>(null);
  const { scene } = useThree();
  const fogNight = useMemo(() => new THREE.Color("#c7d7ee"), []);
  const fogDay = useMemo(() => new THREE.Color("#cde8ff"), []);
  const shadowSize = shadowQuality === "high" ? 2048 : shadowQuality === "medium" ? 1024 : 512;
  const fogFar = fogQuality === "high" ? 150 : fogQuality === "medium" ? 120 : 88;

  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 0.035;
    const daylight = Math.max(0.22, 0.58 + Math.sin(t) * 0.42);
    const playerState = player.current;
    if (targetRef.current) targetRef.current.position.set(playerState.localX, playerState.height + 0.5, playerState.localZ);
    if (sunRef.current) {
      sunRef.current.position.set(playerState.localX + Math.cos(t) * 34, Math.sin(t) * 36 + 18, playerState.localZ + 22);
      sunRef.current.intensity = 1.15 + daylight * 1.35;
      if (targetRef.current) sunRef.current.target = targetRef.current;
    }
    if (ambientRef.current) ambientRef.current.intensity = 0.34 + daylight * 0.36;
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.lerpColors(fogNight, fogDay, daylight);
    }
  });

  return (
    <>
      <ambientLight ref={ambientRef} intensity={0.55} />
      <object3D ref={targetRef} />
      <directionalLight
        ref={sunRef}
        position={[24, 38, 18]}
        intensity={2.2}
        castShadow={shadowQuality !== "off"}
        shadow-mapSize-width={shadowSize}
        shadow-mapSize-height={shadowSize}
        shadow-camera-left={-24}
        shadow-camera-right={24}
        shadow-camera-top={24}
        shadow-camera-bottom={-24}
        shadow-camera-near={1}
        shadow-camera-far={100}
        shadow-bias={-0.0004}
      />
      <fog attach="fog" args={["#cde8ff", Math.max(32, fogFar * 0.36), fogFar]} />
    </>
  );
}
