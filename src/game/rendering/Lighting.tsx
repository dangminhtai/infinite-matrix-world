export function Lighting() {
  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[24, 38, 18]} intensity={2.2} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} />
      <fog attach="fog" args={["#cde8ff", 62, 142]} />
    </>
  );
}
