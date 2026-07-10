import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

const skyVertexShader = `
  varying vec3 vWorldDirection;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldDirection = normalize(worldPosition.xyz);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const skyFragmentShader = `
  uniform float uTime;
  varying vec3 vWorldDirection;

  void main() {
    float day = 0.5 + 0.5 * sin(uTime * 0.035);
    float horizon = smoothstep(-0.15, 0.65, vWorldDirection.y);
    vec3 dawnLow = vec3(0.98, 0.58, 0.36);
    vec3 dayLow = vec3(0.70, 0.88, 1.0);
    vec3 nightLow = vec3(0.05, 0.11, 0.20);
    vec3 dayHigh = vec3(0.18, 0.50, 0.95);
    vec3 nightHigh = vec3(0.01, 0.03, 0.08);
    vec3 low = mix(nightLow, mix(dawnLow, dayLow, day), day);
    vec3 high = mix(nightHigh, dayHigh, day);
    vec3 color = mix(low, high, horizon);
    float starMask = step(0.72, fract(sin(dot(floor(vWorldDirection.xz * 150.0), vec2(12.9898, 78.233))) * 43758.5453));
    color += vec3(starMask * (1.0 - day) * smoothstep(0.2, 0.9, vWorldDirection.y) * 0.35);
    gl_FragColor = vec4(color, 1.0);
  }
`;

export function SkyDome() {
  const sunRef = useRef<THREE.Mesh>(null);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 } },
        vertexShader: skyVertexShader,
        fragmentShader: skyFragmentShader,
        side: THREE.BackSide,
        depthWrite: false,
      }),
    [],
  );

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    material.uniforms.uTime.value = t;
    if (sunRef.current) {
      const angle = t * 0.035;
      sunRef.current.position.set(Math.cos(angle) * 180, Math.sin(angle) * 130 + 80, -120);
      sunRef.current.lookAt(0, 0, 0);
    }
  });

  return (
    <group>
      <mesh frustumCulled={false}>
        <sphereGeometry args={[420, 48, 24]} />
        <primitive object={material} attach="material" />
      </mesh>
      <mesh ref={sunRef} frustumCulled={false}>
        <circleGeometry args={[10, 32]} />
        <meshBasicMaterial color="#fff4b8" transparent opacity={0.92} depthWrite={false} />
      </mesh>
    </group>
  );
}
