import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/**
 * Checks whether WebGL is supported and working on the current device.
 */
export function detectWebGLSupport(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl');
    return Boolean(gl);
  } catch {
    return false;
  }
}

export interface WebGLCurlFrame {
  active: boolean;
  /** +1 = peeling from left -> right (RTL Next Page), -1 = peeling from right -> left (Prev Page) */
  dir: 1 | -1;
  /** Normalized curl progress 0..1 */
  progress: number;
  /** Vertical finger offset -1 (bottom) .. +1 (top) controlling corner curl angle */
  cornerTilt: number;
  /** Normalized swipe speed (0..1+) modulating dynamic curl radius between 0.08 and 0.30 */
  speed: number;
}

const BLEED_PX = 24; // Extra bleed around book box so lifted 3D curl roll is never clipped

const CURL_VERTEX_SHADER = /* glsl */ `
  uniform vec2 uFoldPos;
  uniform vec2 uFoldNormal;
  uniform float uRadius;
  uniform float uAspectH;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  varying float vFoldDist;
  varying float vCurlArc;

  const float PI = 3.141592653589793;

  void main() {
    vUv = uv;
    // Isotropic world-space page coordinates: x in [-0.5, 0.5], y in [-uAspectH/2, uAspectH/2]
    vec2 p0 = vec2(position.x, position.y * uAspectH);

    // Signed distance from fold axis into the peeled region
    float d = dot(p0 - uFoldPos, uFoldNormal);
    float R = uRadius;

    vec3 pos;
    vec3 norm;
    float arcFactor = 0.0;

    if (d <= 0.0) {
      // Uncurled flat part of the page
      pos = vec3(p0, 0.0);
      norm = vec3(0.0, 0.0, 1.0);
    } else if (d <= PI * R) {
      // Cylindrical 180-degree curl around the fold axis
      float phi = d / R;
      vec2 base = p0 - d * uFoldNormal;
      vec2 xy = base + (R * sin(phi)) * uFoldNormal;
      float z = R * (1.0 - cos(phi));
      pos = vec3(xy, z);
      // Exact analytical outward front-face normal derived from d(pos)/dd x d(pos)/dt
      norm = normalize(vec3(-sin(phi) * uFoldNormal.x, -sin(phi) * uFoldNormal.y, cos(phi)));
      arcFactor = sin(phi);
    } else {
      // Folded-over flap extending past 180 degrees with subtle natural paper settle
      float rem = d - PI * R;
      vec2 base = p0 - d * uFoldNormal;
      float droop = R * 0.32 * (1.0 - exp(-rem * 2.4));
      float droopSlope = R * 0.32 * 2.4 * exp(-rem * 2.4);
      vec2 xy = base - rem * uFoldNormal;
      float z = max(0.008, 2.0 * R - droop);
      pos = vec3(xy, z);
      norm = normalize(vec3(-uFoldNormal.x * droopSlope, -uFoldNormal.y * droopSlope, -1.0));
      arcFactor = 0.0;
    }

    vNormal = norm;
    vWorldPos = pos;
    vFoldDist = d;
    vCurlArc = arcFactor;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const CURL_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform sampler2D uFrontTex;
  uniform sampler2D uBackTex;
  uniform float uRadius;
  uniform float uOpacity;
  uniform vec3 uLightDir;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  varying float vFoldDist;
  varying float vCurlArc;

  void main() {
    vec3 N = normalize(vNormal);
    bool isFront = gl_FrontFacing;
    if (!isFront) {
      N = -N;
    }

    vec4 frontSample = texture2D(uFrontTex, vUv);
    // Back face: next-page texture mirrored naturally by 3D fold (or sampled mirrored)
    // with 15% darkening and 8% subtle ink show-through from the front page
    vec4 backSample = texture2D(uBackTex, vUv);

    vec3 baseColor;
    if (isFront) {
      baseColor = frontSample.rgb;
    } else {
      vec3 darkenedNext = backSample.rgb * 0.85;
      // Subtle 8% front-ink show-through
      float frontInk = 1.0 - dot(frontSample.rgb, vec3(0.299, 0.587, 0.114));
      baseColor = darkenedNext - vec3(frontInk * 0.08);
      baseColor = clamp(baseColor, 0.0, 1.0);
    }

    // Lambert diffuse + ambient lighting
    vec3 L = normalize(uLightDir);
    vec3 V = normalize(vec3(0.0, 0.0, 1.8) - vWorldPos);
    vec3 H = normalize(L + V);

    float ndotl = max(dot(N, L), 0.0);
    float diffuse = 0.66 + 0.36 * ndotl;

    // Soft specular sheen strictly accentuated on the curved bend region
    float spec = pow(max(dot(N, H), 0.0), 26.0) * (0.14 + 0.22 * vCurlArc);

    // Crease shadow gradient increasing right near the fold line (d ≈ 0)
    float creaseProx = exp(-abs(vFoldDist) / max(0.035, uRadius * 0.65));
    float creaseShade = 1.0 - 0.18 * creaseProx * step(-0.04, vFoldDist);

    vec3 finalCol = baseColor * diffuse * creaseShade + vec3(spec);
    gl_FragColor = vec4(finalCol, frontSample.a * uOpacity);
  }
`;

const UNDER_VERTEX_SHADER = /* glsl */ `
  uniform float uAspectH;
  varying vec2 vUv;
  varying vec2 vPlanePos;

  void main() {
    vUv = uv;
    vPlanePos = vec2(position.x, position.y * uAspectH);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(vPlanePos, position.z, 1.0);
  }
`;

const UNDER_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform sampler2D uUnderTex;
  uniform vec2 uFoldPos;
  uniform vec2 uFoldNormal;
  uniform float uRadius;
  uniform float uShadowStrength;

  varying vec2 vUv;
  varying vec2 vPlanePos;

  void main() {
    vec4 col = texture2D(uUnderTex, vUv);

    // Signed distance from fold line toward the peeled/exposed side
    // Projected outer edge of the rolled cylinder sits at s = uRadius
    float s = dot(vPlanePos - uFoldPos, uFoldNormal);

    // Soft penumbra shadow following the curled paper edge onto the underlying page
    float distPastRoll = s - uRadius * 0.82;
    float penumbra = 0.09 + uRadius * 0.55;
    float shadowMask = 1.0 - smoothstep(-uRadius * 0.4, penumbra, distPastRoll);
    // Fade shadow out smoothly when the sheet is almost completely off the page
    float shadow = shadowMask * 0.46 * uShadowStrength;

    gl_FragColor = vec4(col.rgb * (1.0 - shadow), col.a);
  }
`;

export interface WebGLPageCurlProps {
  width: number;
  height: number;
  frontCanvas: HTMLCanvasElement | null;
  backCanvas: HTMLCanvasElement | null;
  underCanvas: HTMLCanvasElement | null;
  frameRef: React.MutableRefObject<WebGLCurlFrame>;
  visible: boolean;
}

export default function WebGLPageCurl({
  width,
  height,
  frontCanvas,
  backCanvas,
  underCanvas,
  frameRef,
  visible,
}: WebGLPageCurlProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const glRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    curlMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
    underMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
    frontTex: THREE.CanvasTexture;
    backTex: THREE.CanvasTexture;
    underTex: THREE.CanvasTexture;
    rafId: number | null;
    aspectH: number;
  } | null>(null);

  // Initialize Three.js WebGL context once
  useEffect(() => {
    const host = containerRef.current;
    if (!host) return;

    const blank = document.createElement('canvas');
    blank.width = 4;
    blank.height = 4;

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    host.innerHTML = '';
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(28, 1, 0.05, 20);

    const configureTex = (tex: THREE.CanvasTexture) => {
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    };

    const frontTex = configureTex(new THREE.CanvasTexture(blank));
    const backTex = configureTex(new THREE.CanvasTexture(blank));
    const underTex = configureTex(new THREE.CanvasTexture(blank));

    // Underlying flat page mesh
    const underGeo = new THREE.PlaneGeometry(1, 1, 1, 1);
    const underMat = new THREE.ShaderMaterial({
      vertexShader: UNDER_VERTEX_SHADER,
      fragmentShader: UNDER_FRAGMENT_SHADER,
      uniforms: {
        uUnderTex: { value: underTex },
        uFoldPos: { value: new THREE.Vector2(-0.5, 0) },
        uFoldNormal: { value: new THREE.Vector2(-1, 0) },
        uRadius: { value: 0.14 },
        uShadowStrength: { value: 0 },
        uAspectH: { value: 1.4 },
      },
      transparent: true,
      depthWrite: false,
    });
    const underMesh = new THREE.Mesh(underGeo, underMat);
    underMesh.position.z = -0.002;
    scene.add(underMesh);

    // 40×60 High-density deforming page mesh (per specification)
    const curlGeo = new THREE.PlaneGeometry(1, 1, 40, 60);
    const curlMat = new THREE.ShaderMaterial({
      vertexShader: CURL_VERTEX_SHADER,
      fragmentShader: CURL_FRAGMENT_SHADER,
      side: THREE.DoubleSide,
      transparent: true,
      uniforms: {
        uFrontTex: { value: frontTex },
        uBackTex: { value: backTex },
        uFoldPos: { value: new THREE.Vector2(-0.5, 0) },
        uFoldNormal: { value: new THREE.Vector2(-1, 0) },
        uRadius: { value: 0.14 },
        uAspectH: { value: 1.4 },
        uOpacity: { value: 1.0 },
        uLightDir: { value: new THREE.Vector3(-0.35, 0.45, 1.0) },
      },
    });
    const curlMesh = new THREE.Mesh(curlGeo, curlMat);
    scene.add(curlMesh);

    glRef.current = {
      renderer,
      scene,
      camera,
      curlMesh,
      underMesh,
      frontTex,
      backTex,
      underTex,
      rafId: null,
      aspectH: 1.4,
    };

    return () => {
      const st = glRef.current;
      if (st?.rafId) cancelAnimationFrame(st.rafId);
      curlGeo.dispose();
      curlMat.dispose();
      underGeo.dispose();
      underMat.dispose();
      frontTex.dispose();
      backTex.dispose();
      underTex.dispose();
      renderer.dispose();
      glRef.current = null;
    };
  }, []);

  // Resize renderer & match frustum exactly so z=0 plane aligns pixel-for-pixel with DOM card
  useEffect(() => {
    const st = glRef.current;
    if (!st || width < 40 || height < 40) return;

    const totalW = width + BLEED_PX * 2;
    const totalH = height + BLEED_PX * 2;
    const aspectH = height / width; // Page world width = 1.0, page world height = aspectH
    const totalWorldH = aspectH * (totalH / height);

    st.aspectH = aspectH;
    st.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    st.renderer.setSize(totalW, totalH, false);
    st.renderer.domElement.style.width = `${totalW}px`;
    st.renderer.domElement.style.height = `${totalH}px`;

    st.curlMesh.material.uniforms.uAspectH.value = aspectH;
    st.underMesh.material.uniforms.uAspectH.value = aspectH;

    const fovRad = (st.camera.fov * Math.PI) / 180;
    const dist = (totalWorldH / 2) / Math.tan(fovRad / 2);
    st.camera.aspect = totalW / totalH;
    st.camera.position.set(0, 0, dist);
    st.camera.lookAt(0, 0, 0);
    st.camera.updateProjectionMatrix();
  }, [width, height]);

  // Upload updated Canvas textures whenever front/back/under canvases change
  useEffect(() => {
    const st = glRef.current;
    if (!st || !frontCanvas) return;
    st.frontTex.image = frontCanvas;
    st.frontTex.colorSpace = THREE.SRGBColorSpace;
    st.frontTex.needsUpdate = true;
  }, [frontCanvas]);

  useEffect(() => {
    const st = glRef.current;
    if (!st || !backCanvas) return;
    st.backTex.image = backCanvas;
    st.backTex.colorSpace = THREE.SRGBColorSpace;
    st.backTex.needsUpdate = true;
  }, [backCanvas]);

  useEffect(() => {
    const st = glRef.current;
    if (!st || !underCanvas) return;
    st.underTex.image = underCanvas;
    st.underTex.colorSpace = THREE.SRGBColorSpace;
    st.underTex.needsUpdate = true;
  }, [underCanvas]);

  // 60fps render loop — runs ONLY while `visible` (during active drag or spring release)
  useEffect(() => {
    const st = glRef.current;
    if (!st) return;

    if (!visible) {
      if (st.rafId !== null) {
        cancelAnimationFrame(st.rafId);
        st.rafId = null;
      }
      return;
    }

    const renderTick = () => {
      const f = frameRef.current;
      const p = Math.max(0, Math.min(1, f.progress));
      const sinP = Math.sin(p * Math.PI);

      // Dynamic curl radius in [0.08, 0.30] of page width (1.0), modulated by distance & velocity
      const radius = Math.max(
        0.08,
        Math.min(0.30, 0.085 + 0.145 * sinP + Math.min(0.08, f.speed * 0.09)),
      );

      // Corner tilt angle: pulling top-left tilts clockwise; bottom-left tilts counter-clockwise
      const maxTiltRad = 0.42; // ~24 degrees natural corner diagonal
      const theta = f.cornerTilt * maxTiltRad * (1 - p * 0.45);

      // uFoldNormal points toward the grabbed/peeled corner:
      // - RTL Next Page (dir = +1, peeling from left -> right): normal points LEFT (-cos, sin)
      // - RTL Prev Page (dir = -1, peeling from right -> left): normal points RIGHT (+cos, sin)
      const len = Math.hypot(Math.cos(theta), Math.sin(theta)) || 1;
      const nx = (f.dir === 1 ? -Math.cos(theta) : Math.cos(theta)) / len;
      const ny = Math.sin(theta) / len;

      // Exact support distance from center (0,0) to the grabbed corner along uFoldNormal:
      // At p = 0, fold line sits right at the grabbed corner (100% flat, zero jump from DOM).
      // At p = 1, fold line + roll radius clears the opposite spine completely!
      const halfSpan = 0.5 * Math.abs(nx) + 0.5 * st.aspectH * Math.abs(ny);
      const totalSweep = 2 * halfSpan + radius + 0.06;
      const foldOffset = halfSpan - p * totalSweep;
      const foldX = nx * foldOffset;
      const foldY = ny * foldOffset;

      const cu = st.curlMesh.material.uniforms;
      cu.uFoldPos.value.set(foldX, foldY);
      cu.uFoldNormal.value.set(nx, ny);
      cu.uRadius.value = radius;
      cu.uOpacity.value = 1.0;

      const uu = st.underMesh.material.uniforms;
      uu.uFoldPos.value.set(foldX, foldY);
      uu.uFoldNormal.value.set(nx, ny);
      uu.uRadius.value = radius;
      uu.uShadowStrength.value = Math.min(1, sinP * 1.45);

      st.renderer.render(st.scene, st.camera);
      st.rafId = requestAnimationFrame(renderTick);
    };

    st.rafId = requestAnimationFrame(renderTick);
    return () => {
      if (st.rafId !== null) {
        cancelAnimationFrame(st.rafId);
        st.rafId = null;
      }
    };
  }, [visible, frameRef]);

  return (
    <div
      ref={containerRef}
      className="qr-webgl-layer"
      style={{
        position: 'absolute',
        inset: -BLEED_PX,
        zIndex: 12,
        pointerEvents: 'none',
        opacity: visible ? 1 : 0,
      }}
      aria-hidden="true"
    />
  );
}
