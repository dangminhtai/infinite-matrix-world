import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { ChunkPayload, DecorInstance } from "../types";

function collectTrees(chunks: ChunkPayload[], originCx: bigint, originCy: bigint, density: number) {
  return chunks.flatMap((chunk) => {
    const baseX = Number(BigInt(chunk.cx) - originCx) * chunk.size;
    const baseZ = Number(BigInt(chunk.cy) - originCy) * chunk.size;
    return chunk.trees.slice(0, Math.ceil(chunk.trees.length * density)).map((tree) => ({ ...tree, x: tree.x + baseX, z: tree.z + baseZ }));
  });
}

function createCanopyGeometry(): THREE.BufferGeometry {
  const layers = [
    { radius: 0.58, height: 1.15, y: 0.88 },
    { radius: 0.48, height: 1.02, y: 1.35 },
    { radius: 0.35, height: 0.82, y: 1.76 },
  ];
  const geometries = layers.map(({ radius, height, y }) => {
    const geometry = new THREE.ConeGeometry(radius, height, 6, 1);
    geometry.translate(0, y, 0);
    return geometry;
  });
  const merged = mergeGeometries(geometries, false);
  geometries.forEach((geometry) => geometry.dispose());
  if (!merged) throw new Error("Không thể tạo geometry tán cây procedural");
  merged.computeBoundingSphere();
  return merged;
}

function AnimatedLeavesMaterial() {
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  const shaderRef = useRef<THREE.WebGLProgramParametersWithUniforms | null>(null);
  useFrame(({ clock }) => {
    if (shaderRef.current) shaderRef.current.uniforms.uTreeTime.value = clock.elapsedTime;
  });
  return <meshStandardMaterial
    ref={materialRef}
    color="#2f8142"
    roughness={0.94}
    customProgramCacheKey={() => "procedural-tree-wind-v1"}
    onBeforeCompile={(shader) => {
      shader.uniforms.uTreeTime = { value: 0 };
      shader.vertexShader = `uniform float uTreeTime;\n${shader.vertexShader}`;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float treePhase = instanceMatrix[3][0] * 0.17 + instanceMatrix[3][2] * 0.13;
          float treeTip = smoothstep(0.55, 2.1, position.y);
          transformed.x += sin(uTreeTime * 1.25 + treePhase) * 0.045 * treeTip;
          transformed.z += cos(uTreeTime * 0.93 + treePhase) * 0.025 * treeTip;
        #endif`,
      );
      shaderRef.current = shader;
    }}
  />;
}

export function TreeInstances({ nearChunks, farChunks, originCx, originCy, density, castShadow }: { nearChunks: ChunkPayload[]; farChunks: ChunkPayload[]; originCx: bigint; originCy: bigint; density: number; castShadow: boolean }) {
  const nearInstances = useMemo(() => collectTrees(nearChunks, originCx, originCy, density * 0.72), [density, nearChunks, originCx, originCy]);
  const farInstances = useMemo(() => collectTrees(farChunks, originCx, originCy, density * 0.46), [density, farChunks, originCx, originCy]);
  return <group>
    <ProceduralTreeInstances instances={nearInstances} castShadow={castShadow} />
    <FarTreeInstances instances={farInstances} />
  </group>;
}

function ProceduralTreeInstances({ instances, castShadow }: { instances: DecorInstance[]; castShadow: boolean }) {
  const leavesRef = useRef<THREE.InstancedMesh>(null);
  const trunksRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const canopyGeometry = useMemo(createCanopyGeometry, []);
  const trunkGeometry = useMemo(() => {
    const geometry = new THREE.CylinderGeometry(0.095, 0.16, 1.05, 6);
    geometry.translate(0, 0.48, 0);
    return geometry;
  }, []);

  useEffect(() => () => {
    canopyGeometry.dispose();
    trunkGeometry.dispose();
  }, [canopyGeometry, trunkGeometry]);

  useLayoutEffect(() => {
    instances.forEach((tree, i) => {
      dummy.position.set(tree.x, tree.y, tree.z);
      dummy.rotation.set(0, tree.rotation, 0);
      dummy.scale.set(tree.scale * (0.88 + (i % 5) * 0.025), tree.scale, tree.scale * (0.88 + (i % 7) * 0.018));
      dummy.updateMatrix();
      leavesRef.current?.setMatrixAt(i, dummy.matrix);
      trunksRef.current?.setMatrixAt(i, dummy.matrix);
    });
    for (const mesh of [leavesRef.current, trunksRef.current]) {
      if (!mesh) continue;
      mesh.count = instances.length;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }, [dummy, instances]);

  return <>
    <instancedMesh ref={leavesRef} args={[canopyGeometry, undefined, instances.length]} castShadow={castShadow} receiveShadow>
      <AnimatedLeavesMaterial />
    </instancedMesh>
    <instancedMesh ref={trunksRef} args={[trunkGeometry, undefined, instances.length]} castShadow={castShadow} receiveShadow>
      <meshStandardMaterial color="#78502e" roughness={0.98} />
    </instancedMesh>
  </>;
}

function FarTreeInstances({ instances }: { instances: DecorInstance[] }) {
  const farRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useLayoutEffect(() => {
    instances.forEach((tree, i) => {
      dummy.position.set(tree.x, tree.y + 0.72 * tree.scale, tree.z);
      dummy.rotation.set(0, tree.rotation, 0);
      dummy.scale.setScalar(tree.scale);
      dummy.updateMatrix();
      farRef.current?.setMatrixAt(i, dummy.matrix);
    });
    if (farRef.current) {
      farRef.current.count = instances.length;
      farRef.current.instanceMatrix.needsUpdate = true;
      farRef.current.computeBoundingSphere();
    }
  }, [dummy, instances]);
  return <instancedMesh ref={farRef} args={[undefined, undefined, instances.length]}>
    <coneGeometry args={[0.48, 1.55, 4]} />
    <meshBasicMaterial color="#286b37" />
  </instancedMesh>;
}
