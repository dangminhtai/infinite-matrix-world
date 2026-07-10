import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

const waterVertexShader = `
  uniform float uTime;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec3 transformed = position;
    float wave = sin(position.x * 0.12 + uTime * 1.5) * 0.05 + cos(position.y * 0.09 + uTime * 1.2) * 0.035;
    transformed.z += wave;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
  }
`;

const waterFragmentShader = `
  varying vec2 vUv;

  void main() {
    vec3 shallow = vec3(0.36, 0.74, 0.92);
    vec3 deep = vec3(0.08, 0.27, 0.48);
    float ripple = 0.5 + 0.5 * sin((vUv.x + vUv.y) * 48.0);
    vec3 color = mix(deep, shallow, 0.62 + ripple * 0.06);
    gl_FragColor = vec4(color, 0.56);
  }
`;

export function Water() {
  const ref = useRef<THREE.Mesh>(null);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 } },
        vertexShader: waterVertexShader,
        fragmentShader: waterFragmentShader,
        transparent: true,
        depthWrite: false,
      }),
    [],
  );
  useFrame(({ clock }) => {
    material.uniforms.uTime.value = clock.elapsedTime;
    if (ref.current) ref.current.position.y = -0.12 + Math.sin(clock.elapsedTime * 1.4) * 0.025;
  });
  return (
    <mesh ref={ref} rotation-x={-Math.PI / 2} position={[0, -0.14, 0]} receiveShadow>
      <planeGeometry args={[260, 260, 48, 48]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}
