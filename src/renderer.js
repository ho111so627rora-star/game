import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { coordOf } from './core.js';

const BALL_STEP = 0.72;
const BALL_Y = 0.34;

export class BoardRenderer {
  constructor(canvas, onPick) {
    this.c = canvas; this.onPick = onPick; this.hover = -1; this.transparent = false;
    this.last = -1; this.win = []; this.pointerDown = null;
    this.raycaster = new THREE.Raycaster(); this.pointer = new THREE.Vector2(); this.clock = new THREE.Clock();
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 0.92;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene(); this.scene.fog = new THREE.Fog(0x080b10, 9, 18);
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 50);
    this.controls = new OrbitControls(this.camera, canvas);
    Object.assign(this.controls, { enableDamping: true, dampingFactor: 0.075, enablePan: false, minDistance: 6.2, maxDistance: 13, minPolarAngle: 0.42, maxPolarAngle: 1.34 });
    this.controls.target.set(0, 1.25, 0);
    this.staticGroup = new THREE.Group(); this.pieceGroup = new THREE.Group(); this.markerGroup = new THREE.Group();
    this.hitTargets = []; this.scene.add(this.staticGroup, this.pieceGroup, this.markerGroup);
    this.makeMaterials(); this.makeScene(); this.reset(); this.bind();
    new ResizeObserver(() => this.resize()).observe(canvas); this.resize(); this.animate();
  }

  makeMaterials() {
    this.blackMaterial = new THREE.MeshPhysicalMaterial({ color: 0x101721, roughness: 0.18, metalness: 0.35, clearcoat: 0.95, clearcoatRoughness: 0.14 });
    this.whiteMaterial = new THREE.MeshPhysicalMaterial({ color: 0xe5e1d8, roughness: 0.27, metalness: 0.08, clearcoat: 0.7, clearcoatRoughness: 0.22 });
    this.ghostBlackMaterial = this.blackMaterial.clone(); this.ghostWhiteMaterial = this.whiteMaterial.clone();
    for (const m of [this.ghostBlackMaterial, this.ghostWhiteMaterial]) { m.transparent = true; m.opacity = 0.42; m.depthWrite = false; }
    this.rodMaterial = new THREE.MeshStandardMaterial({ color: 0x8d98a4, metalness: 0.86, roughness: 0.2 });
    this.rodHoverMaterial = new THREE.MeshStandardMaterial({ color: 0xe3b86e, emissive: 0x8d520e, emissiveIntensity: 0.75, metalness: 0.7, roughness: 0.16 });
    this.rodFullMaterial = new THREE.MeshStandardMaterial({ color: 0x424b55, metalness: 0.6, roughness: 0.46 });
  }

  makeScene() {
    const hemi = new THREE.HemisphereLight(0x8ba2b8, 0x080a0d, 1.5);
    const sun = new THREE.DirectionalLight(0xffe0b0, 3.1); sun.position.set(5, 9, 6); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = sun.shadow.camera.bottom = -5; sun.shadow.camera.right = sun.shadow.camera.top = 5; sun.shadow.bias = -0.00025;
    const fill = new THREE.PointLight(0x4d7da0, 10, 14, 2); fill.position.set(-4, 4, -3); this.scene.add(hemi, sun, fill);
    const side = new THREE.MeshStandardMaterial({ color: 0x111820, metalness: 0.65, roughness: 0.38 });
    const board = new THREE.Mesh(new THREE.BoxGeometry(4.7, 0.36, 4.7), [side, side, new THREE.MeshStandardMaterial({ color: 0x222b34, metalness: 0.48, roughness: 0.3 }), side, side, side]);
    board.position.y = -0.2; board.castShadow = board.receiveShadow = true; this.staticGroup.add(board);
    const gridPoints = [];
    for (let i = -2; i <= 2; i++) { gridPoints.push(new THREE.Vector3(i, 0.006, -2), new THREE.Vector3(i, 0.006, 2), new THREE.Vector3(-2, 0.006, i), new THREE.Vector3(2, 0.006, i)); }
    this.staticGroup.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(gridPoints), new THREE.LineBasicMaterial({ color: 0xa47a43, transparent: true, opacity: 0.62 })));
    const rodGeometry = new THREE.CylinderGeometry(0.047, 0.055, 3.05, 18), capGeometry = new THREE.SphereGeometry(0.085, 18, 12);
    const hitGeometry = new THREE.CylinderGeometry(0.29, 0.29, 3.25, 8), padGeometry = new THREE.CylinderGeometry(0.2, 0.2, 0.025, 28);
    for (let rod = 0; rod < 16; rod++) {
      const { x, z } = this.worldRod(rod), mesh = new THREE.Mesh(rodGeometry, this.rodMaterial); mesh.position.set(x, 1.48, z); mesh.castShadow = true; mesh.userData.rod = rod;
      const cap = new THREE.Mesh(capGeometry, this.rodMaterial); cap.position.set(x, 3.03, z); cap.userData.rod = rod;
      const pad = new THREE.Mesh(padGeometry, new THREE.MeshStandardMaterial({ color: 0x50402e, metalness: 0.55, roughness: 0.4 })); pad.position.set(x, 0.025, z); pad.userData.rod = rod;
      const hit = new THREE.Mesh(hitGeometry, new THREE.MeshBasicMaterial({ visible: false })); hit.position.set(x, 1.48, z); hit.userData.rod = rod;
      this.staticGroup.add(mesh, cap, pad, hit); this.hitTargets.push(hit, pad);
    }
    const floor = new THREE.Mesh(new THREE.CircleGeometry(6.5, 64), new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.42 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -0.4; floor.receiveShadow = true; this.scene.add(floor);
  }

  worldRod(rod) { return { x: rod % 4 - 1.5, z: Math.floor(rod / 4) - 1.5 }; }
  worldCell(cell) { const { x, y, z } = coordOf(cell); return new THREE.Vector3(x - 1.5, BALL_Y + z * BALL_STEP, y - 1.5); }
  reset() { this.camera.position.set(6.7, 5.4, 7.2); this.controls.target.set(0, 1.18, 0); this.controls.update(); }
  resize() { const width = Math.max(1, this.c.clientWidth), height = Math.max(1, this.c.clientHeight); this.renderer.setSize(width, height, false); this.camera.aspect = width / height; this.camera.updateProjectionMatrix(); }
  setState(game) { this.game = game; this.last = game.history.at(-1)?.cell ?? -1; this.win = game.winningLine || []; if (this.hover >= 0 && game.heights[this.hover] >= 4) this.hover = -1; this.rebuildPieces(); }
  clearGroup(group) { while (group.children.length) { const child = group.children.pop(); child.geometry?.dispose(); if (child.material && ![this.blackMaterial, this.whiteMaterial, this.ghostBlackMaterial, this.ghostWhiteMaterial].includes(child.material)) child.material.dispose?.(); } }
  makeBall(player, ghost = false) { let material = ghost ? (player === 1 ? this.ghostBlackMaterial : this.ghostWhiteMaterial) : (player === 1 ? this.blackMaterial : this.whiteMaterial); if (!ghost && this.transparent) { material = material.clone(); material.transparent = true; material.opacity = 0.62; material.depthWrite = false; } const ball = new THREE.Mesh(new THREE.SphereGeometry(0.31, 32, 22), material); ball.castShadow = !ghost; ball.receiveShadow = true; return ball; }

  rebuildPieces() {
    if (!this.game) return; this.clearGroup(this.pieceGroup); this.clearGroup(this.markerGroup);
    for (let i = 0; i < 64; i++) { const player = this.game.cells[i]; if (!player) continue; const ball = this.makeBall(player); ball.position.copy(this.worldCell(i)); this.pieceGroup.add(ball); if (i === this.last || this.win.includes(i)) this.addBallMarker(ball.position, this.win.includes(i) ? 0xffd21f : 0x52c7ff); }
    if (this.hover >= 0 && this.game.heights[this.hover] < 4) { const { x, z } = this.worldRod(this.hover), ghost = this.makeBall(this.game.turn, true); ghost.position.set(x, BALL_Y + this.game.heights[this.hover] * BALL_STEP, z); this.pieceGroup.add(ghost); const ring = new THREE.Mesh(new THREE.TorusGeometry(0.41, 0.045, 12, 48), new THREE.MeshBasicMaterial({ color: 0xffc928, transparent: true, opacity: 0.9 })); ring.rotation.x = Math.PI / 2; ring.position.set(x, 0.035, z); this.markerGroup.add(ring); }
    if (this.win.length === 4) this.addWinningBeam(); this.updateRodMaterials();
  }

  addBallMarker(position, color) { const marker = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.035, 10, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthTest: false })); marker.position.copy(position); marker.lookAt(this.camera.position); marker.renderOrder = 5; this.markerGroup.add(marker); }
  addWinningBeam() { const a = this.worldCell(this.win[0]), b = this.worldCell(this.win[3]), direction = new THREE.Vector3().subVectors(b, a); const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, direction.length() + 0.6, 16), new THREE.MeshBasicMaterial({ color: 0xffd21f, transparent: true, opacity: 0.9, depthTest: false })); beam.position.copy(a).add(b).multiplyScalar(0.5); beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()); beam.renderOrder = 6; this.markerGroup.add(beam); }
  updateRodMaterials() { for (const object of this.staticGroup.children) { const rod = object.userData.rod; if (rod == null || !object.isMesh || !object.geometry.type.includes('Cylinder') || object.material.visible === false) continue; object.material = this.game.heights[rod] >= 4 ? this.rodFullMaterial : rod === this.hover ? this.rodHoverMaterial : this.rodMaterial; } }
  setPointer(event) { const rect = this.c.getBoundingClientRect(); this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1; this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1; }
  pick(event) { if (!this.game) return -1; this.setPointer(event); this.raycaster.setFromCamera(this.pointer, this.camera); const hits = this.raycaster.intersectObjects(this.hitTargets, false); return hits.map(hit => hit.object.userData.rod).find(rod => this.game.heights[rod] < 4) ?? -1; }
  bind() { this.c.addEventListener('pointerdown', e => { this.pointerDown = { x: e.clientX, y: e.clientY }; }); this.c.addEventListener('pointermove', e => { if (this.pointerDown) return; const rod = this.pick(e); if (rod !== this.hover) { this.hover = rod; this.rebuildPieces(); } }); this.c.addEventListener('pointerleave', () => { if (!this.pointerDown && this.hover !== -1) { this.hover = -1; this.rebuildPieces(); } }); this.c.addEventListener('pointerup', e => { if (!this.pointerDown) return; const distance = Math.hypot(e.clientX - this.pointerDown.x, e.clientY - this.pointerDown.y); this.pointerDown = null; if (distance < 7) this.onPick(this.pick(e)); }); }
  draw() { this.rebuildPieces(); }
  animate() { requestAnimationFrame(() => this.animate()); const time = this.clock.getElapsedTime(); for (const child of this.markerGroup.children) if (child.geometry?.type === 'TorusGeometry') child.material.opacity = 0.68 + Math.sin(time * 4) * 0.22; this.controls.update(); this.renderer.render(this.scene, this.camera); }
}
