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

  // Ashima 3D simplex noise (Stefan Gustavson / Ian McEwan, MIT).
  // Produces smooth isotropic noise — no axis-aligned cubic banding.
  vec4 permute(vec4 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod(i, 289.0);
    vec4 p = permute(permute(permute(
                i.z + vec4(0.0, i1.z, i2.z, 1.0))
              + i.y + vec4(0.0, i1.y, i2.y, 1.0))
              + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 1.0/7.0;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }

  float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * snoise(p);
      p *= 2.03;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 sp = normalize(vPos);
    // Light domain warp for organic continent shapes
    vec3 q = sp * 1.8;
    vec3 warp = vec3(
      snoise(q + vec3(1.7, 9.2, 0.0)),
      snoise(q + vec3(8.3, 2.8, 4.1)),
      snoise(q + vec3(0.5, 5.1, 7.7))
    );
    vec3 p = sp * 2.4 + warp * 0.45;
    // Map fbm (~[-0.6, 0.6]) into a "land mass" field
    float n = fbm(p) * 0.5 + 0.5;
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
