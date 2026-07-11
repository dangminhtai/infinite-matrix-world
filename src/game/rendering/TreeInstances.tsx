import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { ChunkPayload } from "../types";

function collectTrees(chunks: ChunkPayload[], originCx: bigint, originCy: bigint, density: number) {
  return chunks.flatMap((chunk) => {
    const baseX = Number(BigInt(chunk.cx) - originCx) * chunk.size;
    const baseZ = Number(BigInt(chunk.cy) - originCy) * chunk.size;
    return chunk.trees.slice(0, Math.ceil(chunk.trees.length * density)).map((tree) => ({ ...tree, x: tree.x + baseX, z: tree.z + baseZ }));
  });
}

export function TreeInstances({ nearChunks, farChunks, originCx, originCy, density, castShadow }: { nearChunks: ChunkPayload[]; farChunks: ChunkPayload[]; originCx: bigint; originCy: bigint; density: number; castShadow: boolean }) {
  const leavesRef = useRef<THREE.InstancedMesh>(null);
  const trunksRef = useRef<THREE.InstancedMesh>(null);
  const farRef = useRef<THREE.InstancedMesh>(null);
  const instances = useMemo(() => collectTrees(nearChunks, originCx, originCy, density), [density, nearChunks, originCx, originCy]);
  const farInstances = useMemo(() => collectTrees(farChunks, originCx, originCy, density * 0.72), [density, farChunks, originCx, originCy]);
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
    if (leavesRef.current) {
      leavesRef.current.instanceMatrix.needsUpdate = true;
      leavesRef.current.computeBoundingSphere();
    }
    if (trunksRef.current) {
      trunksRef.current.instanceMatrix.needsUpdate = true;
      trunksRef.current.computeBoundingSphere();
    }
    farInstances.forEach((tree, i) => {
      dummy.position.set(tree.x, tree.y + 0.68 * tree.scale, tree.z);
      dummy.rotation.set(0, tree.rotation, 0);
      dummy.scale.setScalar(tree.scale);
      dummy.updateMatrix();
      farRef.current?.setMatrixAt(i, dummy.matrix);
    });
    if (farRef.current) {
      farRef.current.instanceMatrix.needsUpdate = true;
      farRef.current.computeBoundingSphere();
    }
  }, [dummy, farInstances, instances]);
  return (
    <group>
      <instancedMesh ref={leavesRef} args={[undefined, undefined, instances.length]} castShadow={castShadow}>
        <coneGeometry args={[0.42, 1.25, 6]} />
        <meshStandardMaterial color="#2d7f42" roughness={0.95} />
      </instancedMesh>
      <instancedMesh ref={trunksRef} args={[undefined, undefined, instances.length]} castShadow={castShadow}>
        <cylinderGeometry args={[0.11, 0.16, 0.85, 5]} />
        <meshStandardMaterial color="#7a5230" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={farRef} args={[undefined, undefined, farInstances.length]}>
        <coneGeometry args={[0.4, 1.3, 4]} />
        <meshStandardMaterial color="#256c39" roughness={1} />
      </instancedMesh>
    </group>
  );
}
