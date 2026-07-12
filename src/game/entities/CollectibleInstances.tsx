import { useLoader } from "@react-three/fiber";
import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import primogemUrl from "../../models/primogemmorastardust_from_genshin_impact_free.glb?url";

export type CollectibleInstancesHandle = {
  setMatrixAt: (index: number, matrix: THREE.Matrix4) => void;
  commit: (count: number) => void;
};

const MODEL_HEIGHT = 1;
const PREFERRED_MESH = "Primogem_2_Primo_0";

function cloneMaterial(material: THREE.Material | THREE.Material[]): THREE.Material | THREE.Material[] {
  if (Array.isArray(material)) return material.map((entry) => entry.clone());
  const clone = material.clone();
  if (clone instanceof THREE.MeshStandardMaterial) {
    clone.emissive = new THREE.Color("#1f7f90");
    clone.emissiveIntensity = 0.35;
    clone.roughness = Math.min(clone.roughness, 0.45);
  }
  return clone;
}

function preparePrimogem(scene: THREE.Group) {
  scene.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];

  scene.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    meshes.push(child);
  });
  const selected = meshes.find((mesh) => mesh.name === PREFERRED_MESH) ?? meshes[0];
  if (!selected) return null;

  const bounds = new THREE.Box3().setFromObject(selected);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const scale = MODEL_HEIGHT / Math.max(size.y, 0.001);
  const normalize = new THREE.Matrix4().makeScale(scale, scale, scale)
    .multiply(new THREE.Matrix4().makeTranslation(-center.x, -bounds.min.y, -center.z));
  const geometry = selected.geometry.clone();
  geometry.applyMatrix4(normalize.clone().multiply(selected.matrixWorld));
  geometry.computeBoundingSphere();
  return { geometry, material: cloneMaterial(selected.material) };
}

export const CollectibleInstances = forwardRef<CollectibleInstancesHandle, { maxCount: number }>(function CollectibleInstances({ maxCount }, ref) {
  const gltf = useLoader(GLTFLoader, primogemUrl);
  const part = useMemo(() => preparePrimogem(gltf.scene), [gltf.scene]);
  const meshRef = useRef<THREE.InstancedMesh | null>(null);

  useImperativeHandle(ref, () => ({
    setMatrixAt(index, matrix) {
      meshRef.current?.setMatrixAt(index, matrix);
    },
    commit(count) {
      if (!meshRef.current) return;
      meshRef.current.count = count;
      meshRef.current.instanceMatrix.needsUpdate = true;
    },
  }), []);

  if (!part) return null;
  return (
    <instancedMesh
      ref={(mesh) => {
        meshRef.current = mesh;
        if (mesh) mesh.count = 0;
      }}
      args={[part.geometry, part.material, maxCount]}
      castShadow
      frustumCulled={false}
    />
  );
});
