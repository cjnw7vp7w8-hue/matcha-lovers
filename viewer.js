// Matcha Lovers – interactive cup creation.
// The slider drives ONE progress value p (0 → 1). The cup is a real 3D mesh whose vertices are recomputed from
// the shared model (cupshape.js, identical to the one used to render the PowerPoint animation): a ball of dough
// is pressed into a base, the walls rise, the rim is refined, the dough bakes golden, matcha is poured, then bitten.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { state, NP, V, TOP, innerRadius, smooth } from './cupshape.js';

const canvas = document.getElementById('cup3d');
const stage = document.getElementById('viewerStage');
const scrub = document.getElementById('scrub');
const steps = [...document.querySelectorAll('#steps3d li')];
const fill = document.getElementById('stepFill');
const bar = document.getElementById('stepBar');
const stepText = document.getElementById('stepText');
const loading = document.getElementById('viewerLoading');
const AT = steps.map(li => +li.dataset.at);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
const key = new THREE.DirectionalLight(0xffe7c8, 2.0); key.position.set(-4, 6, 3); key.castShadow = true;
key.shadow.mapSize.set(1024, 1024); key.shadow.radius = 6; Object.assign(key.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3 });
key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02; scene.add(key);
const rim = new THREE.DirectionalLight(0xfff1dd, 0.7); rim.position.set(3, 3, -4); scene.add(rim);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.ShadowMaterial({ opacity: 0.2 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
const pivot = new THREE.Group(); scene.add(pivot);

// ---------- textures from the real reference photo
const tl = new THREE.TextureLoader();
const tex = (url, srgb = true) => { const t = tl.load(url); t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
const biscuitMap = tex('tex_biscuit.jpg'), normalMap = tex('tex_normal.jpg', false);
const latteMap = tl.load('tex_latte.jpg'); latteMap.colorSpace = THREE.SRGBColorSpace;
const uBake = { value: 0 };
function biscuitMaterial() {
  const m = new THREE.MeshStandardMaterial({ map: biscuitMap, normalMap, roughness: 0.72, side: THREE.DoubleSide });
  m.onBeforeCompile = sh => {
    sh.uniforms.uBake = uBake;
    sh.fragmentShader = 'uniform float uBake;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
      vec3 dough = mix(vec3(0.60, 0.50, 0.34), vec3(0.86, 0.76, 0.58), smoothstep(0.08, 0.45, lum));
      diffuseColor.rgb = mix(dough, diffuseColor.rgb, uBake);`);
  };
  return m;
}
const biscuit = biscuitMaterial();

// ---------- the deforming cup: NP profile points × SEG around, same topology at every stage
const SEG = 96;
const geo = new THREE.BufferGeometry();
const pos = new Float32Array(NP * (SEG + 1) * 3), uv = new Float32Array(NP * (SEG + 1) * 2), idx = [];
for (let r = 0; r < NP; r++) for (let i = 0; i <= SEG; i++) { const k = r * (SEG + 1) + i; uv[k * 2] = (i / SEG) * 2; uv[k * 2 + 1] = V[r]; }
for (let r = 0; r < NP - 1; r++) for (let i = 0; i < SEG; i++) {
  const a = r * (SEG + 1) + i, b = a + 1, c = a + SEG + 1, d = c + 1; idx.push(a, b, d, a, d, c);
}
geo.setIndex(idx); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
const cupMesh = new THREE.Mesh(geo, biscuit); cupMesh.castShadow = true; cupMesh.receiveShadow = true; pivot.add(cupMesh);
function setProfile(prof) {
  for (let r = 0; r < NP; r++) { const [rr, z] = prof[r];
    for (let i = 0; i <= SEG; i++) { const a = 2 * Math.PI * i / SEG, k = (r * (SEG + 1) + i) * 3;
      pos[k] = rr * Math.cos(a); pos[k + 1] = z; pos[k + 2] = -rr * Math.sin(a); } }   // same axes as the Blender export
  geo.attributes.position.needsUpdate = true; geo.computeVertexNormals(); geo.computeBoundingSphere();
}
// ---------- latte, pour stream, bitten cup, crumbs
const latte = new THREE.Mesh(new THREE.CircleGeometry(1, 96), new THREE.MeshStandardMaterial({ map: latteMap, roughness: 0.45 }));
latte.rotation.x = -Math.PI / 2; pivot.add(latte);
const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.075, 1, 24), new THREE.MeshStandardMaterial({ color: 0x6f9a2c, roughness: 0.25 }));
scene.add(stream);
let bitten = null;
const crumbMat = new THREE.MeshStandardMaterial({ color: 0xd9a45a, roughness: 0.9 });
const crumbs = Array.from({ length: 9 }, () => { const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.025 + Math.random() * 0.03, 0), crumbMat);
  m.castShadow = true; m.visible = false; m.userData = { vx: (Math.random() - 0.5) * 0.6, vz: 0.2 + Math.random() * 0.5, vy: 0.3 + Math.random() * 0.6 }; pivot.add(m); return m; });
new GLTFLoader().loadAsync('cup_bitten.glb').then(g => {
  bitten = g.scene; bitten.visible = false;
  bitten.traverse(o => { if (!o.isMesh) return; o.castShadow = o.receiveShadow = true;
    const n = (o.material && o.material.name) || '';
    if (/latte/i.test(n) || /latte/i.test(o.name)) o.material = latte.material;
    else if (/biscuit/i.test(n)) o.material = biscuit;
    else if (o.material) { o.material.side = THREE.DoubleSide; } });
  pivot.add(bitten); update();
}).catch(() => {}).finally(() => { loading.hidden = true; });

// ---------- one progress value drives everything
let p = 0, biteTime = -1, wasBitten = false, shown = -1;
function update() {
  const s = state(p);
  setProfile(s.profile);
  uBake.value = s.bake; biscuit.normalScale.setScalar(0.2 + 0.4 * s.bake);
  latte.visible = s.pour > 0.02; latte.position.y = s.level; const lr = innerRadius(s.level) + 0.004; latte.scale.set(lr, lr, 1);
  stream.visible = s.stream; stream.position.set(0.05, s.level + (6 - s.level) / 2, 0); stream.scale.set(1, 6 - s.level, 1);
  const isBitten = !!bitten && p >= 0.95;
  cupMesh.visible = !isBitten; if (bitten) bitten.visible = isBitten; if (isBitten) latte.visible = false;
  if (isBitten && !wasBitten) biteTime = performance.now();
  if (!isBitten) crumbs.forEach(c => c.visible = false);
  wasBitten = isBitten;
  // a slow quarter turn reveals the geometry; the camera rises to show the cavity, then the matcha
  pivot.rotation.y = -0.9 + 1.2 * smooth(0, 1, p) + (isBitten ? 0 : 0);
  const el = 2.0 + 2.3 * smooth(0.25, 0.9, p), ty = 0.45 + 0.65 * smooth(0.2, 0.55, p);
  camera.position.set(0, el, 6.4 - 0.3 * p); camera.lookAt(0, ty, 0);
  scrub.style.setProperty('--v', (p * 100).toFixed(1) + '%');
  syncSteps();
}
function syncSteps() {
  let cur = 0; for (let i = 0; i < AT.length; i++) if (p >= AT[i] - 1e-6) cur = i;
  const last = AT.length - 1, seg = cur < last ? (p - AT[cur]) / (AT[cur + 1] - AT[cur]) : 0;
  const f = Math.min(1, (cur + Math.max(0, Math.min(1, seg))) / last);
  fill.style.transform = `scaleX(${f})`; bar.setAttribute('aria-valuenow', Math.round(p * 100));
  steps.forEach((li, i) => { li.classList.toggle('active', i === cur); li.classList.toggle('done', i < cur); });
  if (cur !== shown) { shown = cur; const li = steps[cur]; stepText.style.opacity = 0;
    setTimeout(() => { stepText.innerHTML = `<strong>${li.querySelector('i').textContent}</strong>${li.querySelector('span').textContent}`; stepText.style.opacity = 1; }, 120); }
}
let tween = null;
function glideTo(target) {
  const from = p, t0 = performance.now(), dur = 900; cancelAnimationFrame(tween);
  const tick = now => { const k = Math.min(1, (now - t0) / dur), e = k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    p = from + (target - from) * e; scrub.value = Math.round(p * 1000); update(); if (k < 1) tween = requestAnimationFrame(tick); };
  tween = requestAnimationFrame(tick);
}
steps.forEach((li, i) => li.querySelector('button').addEventListener('click', () => glideTo(i === AT.length - 1 ? 1 : AT[i] + 0.0001)));
scrub.addEventListener('input', () => { cancelAnimationFrame(tween); p = scrub.value / 1000; update(); });

function resize() { const r = stage.getBoundingClientRect(); renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.updateProjectionMatrix(); }
new ResizeObserver(resize).observe(stage); resize(); update();
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
function loop(now) {
  requestAnimationFrame(loop);
  pivot.position.y = reduce ? 0 : Math.sin(now / 900) * 0.02;
  if (biteTime > 0 && bitten && bitten.visible) { const t = (now - biteTime) / 1000;
    crumbs.forEach(c => { const d = c.userData; c.visible = t < 2.5;
      c.position.set(0.55 + d.vx * Math.min(t, 0.8), Math.max(2.1 + d.vy * t - 4.9 * t * t, 0.03), 0.95 + d.vz * Math.min(t, 0.8)); }); }
  renderer.render(scene, camera);
}
requestAnimationFrame(loop);
