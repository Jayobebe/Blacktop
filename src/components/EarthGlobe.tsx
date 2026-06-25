import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSettings, ACCENT_COLORS } from '@/features/settings';

const vertexShader = /* glsl */ `
  varying vec3 vPos;
  varying vec3 vNormal;
  void main() {
    vPos = position;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Simplex-ish noise (cheap hash noise + fbm) -> generates blobby "continents".
// Edge detection via derivative against threshold gives the accent outline.
const fragmentShader = /* glsl */ `
  precision highp float;
  varying vec3 vPos;
  varying vec3 vNormal;
  uniform vec3 uAccent;
  uniform vec3 uLand;
  uniform vec3 uSea;
  uniform float uTime;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n000 = hash(i + vec3(0,0,0));
    float n100 = hash(i + vec3(1,0,0));
    float n010 = hash(i + vec3(0,1,0));
    float n110 = hash(i + vec3(1,1,0));
    float n001 = hash(i + vec3(0,0,1));
    float n101 = hash(i + vec3(1,0,1));
    float n011 = hash(i + vec3(0,1,1));
    float n111 = hash(i + vec3(1,1,1));
    return mix(
      mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
      mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
      f.z
    );
  }
  float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p *= 2.03;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 p = normalize(vPos) * 3.4;
    float n = fbm(p);
    float threshold = 0.52;
    float d = n - threshold;

    // Edge band (accent outline at land/sea boundary)
    float edge = 1.0 - smoothstep(0.0, 0.025, abs(d));

    vec3 base = d > 0.0 ? uLand : uSea;
    // subtle land shade variation
    base += (d > 0.0 ? vec3(0.05) * (n - 0.5) : vec3(-0.02));

    // simple lambert lighting
    vec3 lightDir = normalize(vec3(0.6, 0.4, 0.8));
    float diff = max(dot(vNormal, lightDir), 0.0) * 0.55 + 0.45;
    vec3 col = base * diff;

    // accent outline pop (unaffected by light, slight glow)
    col = mix(col, uAccent, edge * 0.95);

    // rim light
    float rim = pow(1.0 - max(dot(vNormal, vec3(0.0, 0.0, 1.0)), 0.0), 2.5);
    col += uAccent * rim * 0.25;

    gl_FragColor = vec4(col, 1.0);
  }
`;

function hslStringToRgb(hsl: string): [number, number, number] {
  // "38 95% 55%" -> rgb 0-1
  const [h, s, l] = hsl.split(/\s+/).map((v) => parseFloat(v));
  const c = new THREE.Color().setHSL(h / 360, s / 100, l / 100);
  return [c.r, c.g, c.b];
}

function Globe({ accentHsl }: { accentHsl: string }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const uniforms = useMemo(() => {
    const accent = hslStringToRgb(accentHsl);
    return {
      uAccent: { value: new THREE.Vector3(...accent) },
      uLand: { value: new THREE.Vector3(0.18, 0.18, 0.2) },
      uSea: { value: new THREE.Vector3(0.04, 0.04, 0.05) },
      uTime: { value: 0 },
    };
  }, [accentHsl]);

  useFrame((_, dt) => {
    if (meshRef.current) meshRef.current.rotation.y += dt * 0.12;
    uniforms.uTime.value += dt;
  });

  return (
    <mesh ref={meshRef} rotation={[0.35, 0, 0]}>
      <sphereGeometry args={[1, 64, 64]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
      />
    </mesh>
  );
}

interface EarthGlobeProps {
  size?: number;
  className?: string;
}

export function EarthGlobe({ size = 88, className }: EarthGlobeProps) {
  const { settings } = useSettings();
  const accent =
    ACCENT_COLORS.find((c) => c.id === settings.accentColor) ?? ACCENT_COLORS[0];

  return (
    <div
      className={className}
      style={{ width: size, height: size, pointerEvents: 'none' }}
      aria-hidden
    >
      <Canvas
        camera={{ position: [0, 0, 2.6], fov: 35 }}
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 2]}
      >
        <ambientLight intensity={0.6} />
        <Globe accentHsl={accent.hsl} />
      </Canvas>
    </div>
  );
}
