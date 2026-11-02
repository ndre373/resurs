/**
 * background.ts — always-on ambient 3D layer: drifting particle field,
 * slow pulsing wireframe sculptures, gentle colour breathing. Alive even in menus.
 */

import * as THREE from "three";
import { COLORS, QUALITY } from "./config";

export class BackgroundFX {
  private points: THREE.Points;
  private pointsGeo: THREE.BufferGeometry;
  private speeds: Float32Array;
  private phases: Float32Array;
  private sculptures: THREE.Group;
  private count: number;
  /** 0 = calm, 1 = vivid — follows the same energy as the music. */
  energy = 0.3;
  private t = 0;

  constructor(scene: THREE.Scene) {
    this.count = QUALITY.PARTICLES_HIGH;
    this.pointsGeo = new THREE.BufferGeometry();
    const pos = new Float32Array(this.count * 3);
    const col = new Float32Array(this.count * 3);
    this.speeds = new Float32Array(this.count);
    this.phases = new Float32Array(this.count);
    const c = new THREE.Color();
    for (let i = 0; i < this.count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 36;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 22;
      pos[i * 3 + 2] = -Math.random() * 30 + 4;
      c.setHex(COLORS.palette[i % COLORS.palette.length]);
      c.multiplyScalar(0.55 + Math.random() * 0.45);
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
      this.speeds[i] = 0.15 + Math.random() * 0.5;
      this.phases[i] = Math.random() * Math.PI * 2;
    }
    this.pointsGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.pointsGeo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.09,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.points = new THREE.Points(this.pointsGeo, mat);
    scene.add(this.points);

    // Slow wireframe sculptures far behind the UI.
    this.sculptures = new THREE.Group();
    const shapes: Array<[THREE.BufferGeometry, number, THREE.Vector3]> = [
      [new THREE.TorusKnotGeometry(3.2, 0.9, 120, 16), 0x4c1d95, new THREE.Vector3(-9, 2.5, -16)],
      [new THREE.IcosahedronGeometry(2.4, 1), 0x0e7490, new THREE.Vector3(9.5, -1.5, -14)],
      [new THREE.OctahedronGeometry(1.8, 0), 0x9d174d, new THREE.Vector3(3, 4.5, -18)],
    ];
    for (const [geo, color, p] of shapes) {
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.16 }),
      );
      mesh.position.copy(p);
      this.sculptures.add(mesh);
    }
    scene.add(this.sculptures);
  }

  setEnergy(v: number): void {
    this.energy = v;
  }

  /** Halve particle count on weak GPUs — keeps readability, drops cost. */
  degrade(): void {
    if (this.count <= QUALITY.PARTICLES_LOW) return;
    this.count = QUALITY.PARTICLES_LOW;
    this.pointsGeo.setDrawRange(0, this.count);
  }

  update(dt: number): void {
    this.t += dt;
    const pos = this.pointsGeo.getAttribute("position") as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const drift = 0.25 + this.energy * 0.8;
    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;
      arr[i3 + 1] += this.speeds[i] * drift * dt;
      arr[i3] += Math.sin(this.t * 0.5 + this.phases[i]) * dt * 0.15;
      if (arr[i3 + 1] > 12) arr[i3 + 1] = -12;
    }
    pos.needsUpdate = true;

    this.sculptures.rotation.y += dt * 0.03;
    const pulse = 1 + Math.sin(this.t * 0.6) * 0.03;
    this.sculptures.scale.setScalar(pulse);
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.points);
    scene.remove(this.sculptures);
    this.pointsGeo.dispose();
    (this.points.material as THREE.Material).dispose();
    for (const child of this.sculptures.children) {
      const m = child as THREE.Mesh;
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
  }
}
