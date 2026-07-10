import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { ChunkPayload } from "../types";

export function FlowerInstances({ chunks, originCx, originCy }: { chunks: ChunkPayload[]; originCx: bigint; originCy: bigint }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const instances = useMemo(() => chunks.flatMap((chunk) => {
    const baseX = Number(BigInt(chunk.cx) - originCx) * chunk.size;
    const baseZ = Number(BigInt(chunk.cy) - originCy) * chunk.size;
    return chunk.flowers.map((flower) => ({ ...flower, x: flower.x + baseX, z: flower.z + baseZ }));
  }), [chunks, originCx, originCy]);
  useLayoutEffect(() => {
    instances.forEach((flower, i) => {
      dummy.position.set(flower.x, flower.y + 0.08, flower.z);
      dummy.rotation.set(0, flower.rotation, 0);
      dummy.scale.setScalar(0.16 * flower.scale);
      dummy.updateMatrix();
      ref.current?.setMatrixAt(i, dummy.matrix);
    });
    if (ref.current) ref.current.instanceMatrix.needsUpdate = true;
  }, [dummy, instances]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, instances.length]} castShadow>
      <octahedronGeometry args={[1, 0]} />
      <meshStandardMaterial color="#f26aa3" roughness={0.7} />
    </instancedMesh>
  );
}
