// Matcha Lovers – 3D cup viewer. The range input drives one timeline:
// the cup turns a full circle while it is baked, coated, filled, then bitten.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const canvas = document.getElementById('cup3d');
const stage = document.getElementById('viewerStage');
const scrub = document.getElementById('scrub');
const steps = [...document.querySelectorAll('#steps3d li')];
const loading = document.getElementById('viewerLoading');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.localClippingEnabled = true;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
camera.position.set(0, 4.6, 5.3);
camera.lookAt(0, 0.85, 0);

const key = new THREE.DirectionalLight(0xfff1dc, 1.6);
key.position.set(-3, 6, 4); key.castShadow = true;
key.shadow.mapSize.set(1024, 1024); key.shadow.radius = 8;
Object.assign(key.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3 });
key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
scene.add(key);
const rim = new THREE.DirectionalLight(0xd9f0c0, 0.9); rim.position.set(3, 3, -4); scene.add(rim);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.ShadowMaterial({ opacity: 0.22 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

const clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 3);   // keeps everything below y = constant
const pivot = new THREE.Group(); scene.add(pivot);
let whole = null, bitten = null, latteW = null, latteB = null, latteY = 1.55, cupTop = 2.07;
const crumbs = [];

function prep(root) {
  let latte = null;
  root.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach(m => { m.clippingPlanes = [clip]; m.side = THREE.DoubleSide; m.envMapIntensity = 0.9; });
    if (/latte/i.test(o.name) || /latte/i.test(mats[0].name || '')) latte = o;
  });
  return latte;
}

const loader = new GLTFLoader();
Promise.all([loader.loadAsync('cup_nobite.glb'), loader.loadAsync('cup.glb')]).then(([a, b]) => {
  whole = a.scene; bitten = b.scene;
  latteW = prep(whole); latteB = prep(bitten);
  const box = new THREE.Box3().setFromObject(bitten); cupTop = box.max.y;
  if (latteB) latteY = latteB.position.y;
  pivot.add(whole); pivot.add(bitten);
  const crumbMat = new THREE.MeshStandardMaterial({ color: 0xc9944f, roughness: 0.9 });
  for (let i = 0; i < 10; i++) {
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.02 + Math.random() * 0.03, 0), crumbMat);
    m.castShadow = true; m.visible = false;
    m.userData = { vx: (Math.random() - 0.5) * 0.5, vz: 0.15 + Math.random() * 0.35, vy: 0.4 + Math.random() * 0.8 };
    pivot.add(m); crumbs.push(m);
  }
  loading.hidden = true;
  update();
}).catch(() => { loading.textContent = 'The 3D cup could not load. Try refreshing the page.'; });

const smooth = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };
let p = 0, biteTime = -1, wasBitten = false, idle = 0;

function update() {
  if (!whole) return;
  // 1) turn: a full circle that ends with the bite facing you
  pivot.rotation.y = -Math.PI * 2 * (1 - p) * 0.9;
  // 2) bake from base to rim
  const h = smooth(0.0, 0.45, p) * (cupTop + 0.05) + 0.001;
  clip.constant = h;
  // 3) matcha poured
  const pour = smooth(0.62, 0.84, p);
  [latteW, latteB].forEach(l => { if (!l) return; l.visible = pour > 0.001; l.position.y = 0.12 + (latteY - 0.12) * pour;
    const s = (0.6 + 0.13 * l.position.y - 0.056) / (0.6 + 0.13 * latteY - 0.056); l.scale.set(s, 1, s); });
  // 4) bite
  const isBitten = p >= 0.88;
  whole.visible = !isBitten; bitten.visible = isBitten;
  if (isBitten && !wasBitten) biteTime = performance.now();
  if (!isBitten) crumbs.forEach(c => c.visible = false);
  wasBitten = isBitten;
  steps.forEach((li, i) => {
    const at = +li.dataset.at, next = i + 1 < steps.length ? +steps[i + 1].dataset.at : 2;
    li.classList.toggle('active', p >= at && p < next);
    li.classList.toggle('done', p >= next);
  });
}

function resize() {
  const r = stage.getBoundingClientRect();
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / r.height; camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage); resize();

scrub.addEventListener('input', () => { p = scrub.value / 1000; idle = 0; update(); });

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
function loop(now) {
  requestAnimationFrame(loop);
  if (!whole) return;
  idle += 1;
  pivot.position.y = reduce ? 0 : Math.sin(now / 900) * 0.03;   // gentle float
  if (biteTime > 0 && bitten.visible) {
    const t = (now - biteTime) / 1000;
    crumbs.forEach(c => { const d = c.userData; c.visible = t < 2.5;
      c.position.set(d.vx * Math.min(t, 0.8), Math.max(1.9 + d.vy * t - 4.9 * t * t, 0.03), 0.86 + d.vz * Math.min(t, 0.8)); });
  }
  renderer.render(scene, camera);
}
requestAnimationFrame(loop);
