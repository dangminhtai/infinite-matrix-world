import { useLoader } from "@react-three/fiber";
import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import chestUrl from "../../models/medieval_chest.glb?url";

export type ChestInstancesHandle = {
  setMatrixAt: (index: number, matrix: THREE.Matrix4) => void;
  commit: (count: number) => void;
};

type PreparedPart = {
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
};

const MODEL_HEIGHT = 0.82;

function cloneMaterial(material: THREE.Material | THREE.Material[]): THREE.Material | THREE.Material[] {
  if (Array.isArray(material)) return material.map((entry) => entry.clone());
  return material.clone();
}

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
    parts.push({ geometry, material: cloneMaterial(child.material) });
  });
  return parts;
}

export const ChestInstances = forwardRef<ChestInstancesHandle, { maxCount: number }>(function ChestInstances({ maxCount }, ref) {
  const gltf = useLoader(GLTFLoader, chestUrl);
  const parts = useMemo(() => prepareParts(gltf.scene), [gltf.scene]);
  const meshes = useRef<Array<THREE.InstancedMesh | null>>([]);

  useImperativeHandle(ref, () => ({
    setMatrixAt(index, matrix) {
      for (const mesh of meshes.current) mesh?.setMatrixAt(index, matrix);
    },
    commit(count) {
      for (const mesh of meshes.current) {
        if (!mesh) continue;
        mesh.count = count;
        mesh.instanceMatrix.needsUpdate = true;
      }
    },
  }), []);

  return <group>
    {parts.map((part, index) => (
      <instancedMesh
        key={index}
        ref={(mesh) => {
          meshes.current[index] = mesh;
          if (mesh) mesh.count = 0;
        }}
        args={[part.geometry, part.material, maxCount]}
        castShadow
        receiveShadow
        frustumCulled={false}
      />
    ))}
  </group>;
});
