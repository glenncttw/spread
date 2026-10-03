// Speed streaks for the toast's entrance (and, fewer of them, its color
// switch tumble): a few cream ribbons that whip
// around the toast while it spins in, each one shooting out, stretching into
// a pointed swoosh and pulling away again. They're curved bands on invisible
// cylinders around the toast; a shader trims each band to its moving piece
// and tapers both ends. They also draw into the outline pass, so they get the
// same wobbly ink edge as the toast.
import * as THREE from 'three';

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vViewNormal;
  void main() {
    vUv = uv;
    vViewNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Keeps only the piece of the band between the tail and the head, shaped
// like a pointed swoosh: thin at both ends, widest a little behind the head.
const trimGLSL = /* glsl */ `
  uniform float uHead;
  uniform float uTail;
  varying vec2 vUv;
  void trim() {
    float along = 1.0 - vUv.x; // the band runs the way the toast turns
    float s = (along - uTail) / max(uHead - uTail, 1e-4);
    if (s < 0.0 || s > 1.0) discard;
    float width = pow(sin(3.14159 * pow(s, 1.6)), 0.7);
    if (abs(vUv.y - 0.5) * 2.0 > width) discard;
  }
`;

// `count` keeps only the first few streaks.
export function createStreaks(color, { count = 5 } = {}) {
  const group = new THREE.Group();
  const streaks = [];
  // Radius, height, how far around it reaches (radians), tilt, when it starts
  // (share of the entrance) and how thick it is.
  const layout = [
    [1.55, 0.15, 3.6, 0.10, 0.02, 0.07],
    [1.85, -0.25, 3.2, -0.14, 0.06, 0.055],
    [1.4, 0.45, 2.8, 0.22, 0.1, 0.045],
    [2.1, 0.05, 3.8, -0.05, 0.13, 0.06],
    [1.7, -0.5, 2.6, 0.18, 0.18, 0.04],
  ];
  for (const [radius, y, reach, tilt, start, thick] of layout.slice(0, count)) {
    const geometry = new THREE.CylinderGeometry(radius, radius, thick * 3.2, 96, 1, true, Math.random() * Math.PI * 2, reach);
    const uniforms = { uHead: { value: 0 }, uTail: { value: 0 }, uColor: { value: new THREE.Color(color) } };
    const toonMaterial = new THREE.ShaderMaterial({
      uniforms,
      side: THREE.DoubleSide,
      vertexShader,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        ${trimGLSL}
        void main() {
          trim();
          gl_FragColor = vec4(uColor, 1.0);
        }
      `,
    });
    const normalMaterial = new THREE.ShaderMaterial({
      uniforms,
      side: THREE.DoubleSide,
      vertexShader,
      fragmentShader: /* glsl */ `
        varying vec3 vViewNormal;
        ${trimGLSL}
        void main() {
          trim();
          gl_FragColor = vec4(normalize(vViewNormal) * 0.5 + 0.5, 1.0);
        }
      `,
    });
    const mesh = new THREE.Mesh(geometry, toonMaterial);
    mesh.position.y = y;
    mesh.rotation.set(tilt, 0, tilt * 0.6);
    mesh.userData.toonMaterial = toonMaterial;
    mesh.userData.normalMaterial = normalMaterial;
    mesh.frustumCulled = false;
    group.add(mesh);
    streaks.push({ mesh, uniforms, start });
  }
  group.visible = false;

  // `t` is the entrance's progress (0..1) and `turn` the toast's spin angle,
  // so the streaks sweep round with it, a little ahead.
  function update(t, turn) {
    group.visible = t > 0 && t < 1;
    group.rotation.y = turn - 0.6;
    for (const { uniforms, start } of streaks) {
      const p = (t - start) / 0.5; // each streak lives for half the entrance
      uniforms.uHead.value = THREE.MathUtils.clamp(p * 1.6, 0, 1);
      uniforms.uTail.value = THREE.MathUtils.clamp(p * 1.6 - 0.75, 0, 1);
    }
  }

  return { group, meshes: streaks.map((s) => s.mesh), update };
}
