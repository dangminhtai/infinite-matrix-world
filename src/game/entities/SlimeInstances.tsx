import { useLoader } from "@react-three/fiber";
import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import cryoSlimeUrl from "../../models/cryo_slime.glb?url";
import fireSlimeUrl from "../../models/fire_slime.glb?url";
import electroSlimeUrl from "../../models/mutated_electro_slime.glb?url";

export type SlimeKind = 0 | 1 | 2;

export type SlimeInstancesHandle = {
  setMatrixAt: (kind: SlimeKind, index: number, matrix: THREE.Matrix4) => void;
  commit: (counts: readonly [number, number, number]) => void;
};

type PreparedPart = {
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
};

const MODEL_HEIGHT = 0.95;

function prepareParts(scene: THREE.Group): PreparedPart[] {
  scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(scene);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const scale = MODEL_HEIGHT / Math.max(size.y, 0.001);
  const normalize = new THREE.Matrix4().makeScale(scale, scale, scale)
    .multiply(new THREE.Matrix4().makeTranslation(-center.x, -bounds.min.y, -center.z));
  const parts: PreparedPart[] = [];

  scene.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const geometry = child.geometry.clone();
    geometry.applyMatrix4(normalize.clone().multiply(child.matrixWorld));
    geometry.computeBoundingSphere();
    parts.push({ geometry, material: child.material });
  });
  return parts;
}

export const SlimeInstances = forwardRef<SlimeInstancesHandle, { maxCount: number }>(function SlimeInstances({ maxCount }, ref) {
  const cryo = useLoader(GLTFLoader, cryoSlimeUrl);
  const fire = useLoader(GLTFLoader, fireSlimeUrl);
  const electro = useLoader(GLTFLoader, electroSlimeUrl);
  const parts = useMemo(() => [
    prepareParts(cryo.scene),
    prepareParts(fire.scene),
    prepareParts(electro.scene),
  ] as const, [cryo.scene, electro.scene, fire.scene]);
  const meshes = useRef<Array<Array<THREE.InstancedMesh | null>>>([[], [], []]);

  useImperativeHandle(ref, () => ({
    setMatrixAt(kind, index, matrix) {
      for (const mesh of meshes.current[kind]) mesh?.setMatrixAt(index, matrix);
    },
    commit(counts) {
      for (let kind = 0; kind < meshes.current.length; kind += 1) {
        for (const mesh of meshes.current[kind]) {
          if (!mesh) continue;
          mesh.count = counts[kind] ?? 0;
          mesh.instanceMatrix.needsUpdate = true;
        }
      }
    },
  }), []);

  return <group>
    {parts.map((kindParts, kind) => kindParts.map((part, partIndex) => (
      <instancedMesh
        key={`${kind}:${partIndex}`}
        ref={(mesh) => {
          meshes.current[kind][partIndex] = mesh;
          if (mesh) mesh.count = 0;
        }}
        args={[part.geometry, part.material, maxCount]}
        castShadow
        receiveShadow
        frustumCulled={false}
      />
    )))}
  </group>;
});
