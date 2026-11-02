/**
 * burst.ts — pooled particle bursts fired by DOM games on feedback events
 * (correct answer → bright teal spray on the answering side; miss → dim rose puff).
 * Zero per-frame allocation: a fixed pool, recycled.
 */

import * as THREE from "three";
import { COLORS } from "./config";

interface Particle {
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
}

const POOL = 240;

export class BurstFX {
  private points: THREE.Points;
  private geo: THREE.BufferGeometry;
  private particles: Particle[] = [];
  private cursor = 0;
  private colorAttr: THREE.BufferAttribute;

  constructor(scene: THREE.Scene) {
    this.geo = new THREE.BufferGeometry();
    const pos = new Float32Array(POOL * 3);
    const col = new Float32Array(POOL * 3);
    for (let i = 0; i < POOL; i++) {
      pos[i * 3 + 1] = -100; // parked below the view
      this.particles.push({ vel: new THREE.Vector3(), life: 0, maxLife: 1 });
    }
    this.geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.colorAttr = new THREE.BufferAttribute(col, 3);
    this.geo.setAttribute("color", this.colorAttr);
    const mat = new THREE.PointsMaterial({
      size: 0.16,
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  /** side: -1 left, 0 center, +1 right (screen halves). */
  fire(side: -1 | 0 | 1, good: boolean, count = 26): void {
    const origin = new THREE.Vector3(side * 4.2, 0.4, 2);
    const c = new THREE.Color(good ? COLORS.good : COLORS.bad);
    const posAttr = this.geo.getAttribute("position") as THREE.BufferAttribute;
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % POOL;
      const p = this.particles[i];
      p.life = p.maxLife = 0.6 + Math.random() * 0.5;
      p.vel.set(
        (Math.random() - 0.5) * 4 + side * 1.2,
        1.5 + Math.random() * 3,
        (Math.random() - 0.5) * 2,
      );
      posAttr.setXYZ(i, origin.x, origin.y, origin.z);
      const shade = 0.6 + Math.random() * 0.5;
      this.colorAttr.setXYZ(i, c.r * shade, c.g * shade, c.b * shade);
    }
    posAttr.needsUpdate = true;
    this.colorAttr.needsUpdate = true;
  }

  update(dt: number): void {
    const posAttr = this.geo.getAttribute("position") as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;
    for (let i = 0; i < POOL; i++) {
      const p = this.particles[i];
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        arr[i * 3 + 1] = -100;
        continue;
      }
      p.vel.y -= dt * 2.2; // gravity
      arr[i * 3] += p.vel.x * dt;
      arr[i * 3 + 1] += p.vel.y * dt;
      arr[i * 3 + 2] += p.vel.z * dt;
    }
    posAttr.needsUpdate = true;
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.points);
    this.geo.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
