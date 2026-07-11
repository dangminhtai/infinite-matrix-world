import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { ChunkPayload } from "../types";

export function RockInstances({ chunks, originCx, originCy, density, castShadow }: { chunks: ChunkPayload[]; originCx: bigint; originCy: bigint; density: number; castShadow: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const instances = useMemo(() => chunks.flatMap((chunk) => {
    const baseX = Number(BigInt(chunk.cx) - originCx) * chunk.size;
    const baseZ = Number(BigInt(chunk.cy) - originCy) * chunk.size;
    return chunk.rocks.slice(0, Math.ceil(chunk.rocks.length * density)).map((rock) => ({ ...rock, x: rock.x + baseX, z: rock.z + baseZ }));
  }), [chunks, density, originCx, originCy]);
  useLayoutEffect(() => {
    instances.forEach((rock, i) => {
      dummy.position.set(rock.x, rock.y + 0.15 * rock.scale, rock.z);
      dummy.rotation.set(0.12, rock.rotation, -0.08);
      dummy.scale.set(rock.scale * 0.55, rock.scale * 0.28, rock.scale * 0.46);
      dummy.updateMatrix();
      ref.current?.setMatrixAt(i, dummy.matrix);
    });
    if (ref.current) {
      ref.current.instanceMatrix.needsUpdate = true;
      ref.current.computeBoundingSphere();
    }
  }, [dummy, instances]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, instances.length]} receiveShadow castShadow={castShadow}>
      <dodecahedronGeometry args={[0.55, 0]} />
      <meshStandardMaterial color="#777b80" roughness={0.95} />
    </instancedMesh>
  );
}
