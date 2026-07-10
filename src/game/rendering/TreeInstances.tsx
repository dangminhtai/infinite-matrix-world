import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { ChunkPayload } from "../types";

export function TreeInstances({ chunks, originCx, originCy }: { chunks: ChunkPayload[]; originCx: bigint; originCy: bigint }) {
  const leavesRef = useRef<THREE.InstancedMesh>(null);
  const trunksRef = useRef<THREE.InstancedMesh>(null);
  const instances = useMemo(() => chunks.flatMap((chunk) => {
    const baseX = Number(BigInt(chunk.cx) - originCx) * chunk.size;
    const baseZ = Number(BigInt(chunk.cy) - originCy) * chunk.size;
    return chunk.trees.map((tree) => ({ ...tree, x: tree.x + baseX, z: tree.z + baseZ }));
  }), [chunks, originCx, originCy]);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useLayoutEffect(() => {
    instances.forEach((tree, i) => {
      dummy.position.set(tree.x, tree.y + 0.85 * tree.scale, tree.z);
      dummy.rotation.set(0, tree.rotation, 0);
      dummy.scale.setScalar(tree.scale);
      dummy.updateMatrix();
      leavesRef.current?.setMatrixAt(i, dummy.matrix);
      dummy.position.set(tree.x, tree.y + 0.35 * tree.scale, tree.z);
      dummy.updateMatrix();
      trunksRef.current?.setMatrixAt(i, dummy.matrix);
    });
    if (leavesRef.current) leavesRef.current.instanceMatrix.needsUpdate = true;
    if (trunksRef.current) trunksRef.current.instanceMatrix.needsUpdate = true;
  }, [dummy, instances]);
  return (
    <group>
      <instancedMesh ref={leavesRef} args={[undefined, undefined, instances.length]}>
        <coneGeometry args={[0.42, 1.25, 6]} />
        <meshStandardMaterial color="#2d7f42" roughness={0.95} />
      </instancedMesh>
      <instancedMesh ref={trunksRef} args={[undefined, undefined, instances.length]}>
        <cylinderGeometry args={[0.11, 0.16, 0.85, 5]} />
        <meshStandardMaterial color="#7a5230" roughness={0.9} />
      </instancedMesh>
    </group>
  );
}
