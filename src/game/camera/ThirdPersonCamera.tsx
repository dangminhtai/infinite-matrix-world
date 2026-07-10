import { useFrame, useThree } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";

export function ThirdPersonCamera({ target, yaw, pitch, zoom }: { target: THREE.Vector3; yaw: number; pitch: number; zoom: number }) {
  const desired = useMemo(() => new THREE.Vector3(), []);
  const lookAt = useMemo(() => new THREE.Vector3(), []);
  const { camera } = useThree();
  useFrame((_, delta) => {
    desired.set(
      target.x + Math.sin(yaw) * Math.cos(pitch) * zoom,
      target.y + Math.sin(pitch) * zoom + 5,
      target.z + Math.cos(yaw) * Math.cos(pitch) * zoom,
    );
    camera.position.lerp(desired, 1 - Math.exp(-8 * delta));
    lookAt.set(target.x, target.y + 0.95, target.z);
    camera.lookAt(lookAt);
  });
  return null;
}
