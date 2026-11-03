/**
 * scenes/breath.ts — 3D breathing pacer: a lotus of petals opens on the inhale
 * and closes on the exhale. Coherent 5s/5s rhythm; phase events drive the HUD
 * label and the gliding tones. Emotion/kinesthetic channel, parasympathetic reset.
 */

import * as THREE from "three";
import { BREATH } from "../config";
import type { GameScene, SceneContext } from "../scene";
import { BREATH_PATTERNS, type BreathPattern, type BreathPhase } from "../breathPatterns";

export interface BreathState {
  phase: BreathPhase;
  cycle: number;
  totalCycles: number;
  /** 0..1 openness of the lotus. */
  openness: number;
  done: boolean;
}

export class BreathScene implements GameScene {
  constructor(
    cycles?: number,
    pattern?: BreathPattern,
  ) {
    if (cycles && cycles > 0) this.totalCycles = cycles;
    if (pattern) this.pattern = pattern;
  }

  private ctx!: SceneContext;
  private group = new THREE.Group();
  private petals: THREE.Mesh[] = [];
  private core!: THREE.Mesh;
  private light!: THREE.PointLight;
  private pattern: BreathPattern = BREATH_PATTERNS[0];
  private stepIdx = 0;
  private phaseT = 0;
  private cycle = 0;
  private totalCycles: number = BREATH.DEFAULT_CYCLES;
  private openness = 0;
  private disposed = false;
  private startedAt = 0;

  private get phase(): BreathPhase {
    return this.pattern.steps[this.stepIdx].phase;
  }
  private get phaseLen(): number {
    return this.pattern.steps[this.stepIdx].sec;
  }

  enter(ctx: SceneContext): void {
    this.ctx = ctx;
    this.startedAt = performance.now();

    // lotus petals: flattened spheres arranged radially, two rings
    const petalGeo = new THREE.SphereGeometry(1, 20, 12);
    petalGeo.scale(0.55, 0.16, 1.35);
    for (let ring = 0; ring < 2; ring++) {
      const n = ring === 0 ? 8 : 12;
      const radius = ring === 0 ? 1.15 : 1.8;
      for (let i = 0; i < n; i++) {
        const mat = new THREE.MeshStandardMaterial({
          color: 0x818cf8,
          emissive: 0x4f46e5,
          emissiveIntensity: 0.25,
          transparent: true,
          opacity: ring === 0 ? 0.92 : 0.7,
          roughness: 0.35,
          metalness: 0.1,
        });
        const petal = new THREE.Mesh(petalGeo, mat);
        const a = (i / n) * Math.PI * 2 + (ring === 1 ? Math.PI / n : 0);
        petal.position.set(Math.cos(a) * radius, 0, Math.sin(a) * radius);
        petal.rotation.y = -a + Math.PI / 2;
        petal.userData.ring = ring;
        this.petals.push(petal);
        this.group.add(petal);
      }
    }
    this.core = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 32, 24),
      new THREE.MeshStandardMaterial({
        color: 0x67e8f9,
        emissive: 0x22d3ee,
        emissiveIntensity: 0.8,
        roughness: 0.2,
      }),
    );
    this.core.position.y = 0.25;
    this.group.add(this.core);

    this.light = new THREE.PointLight(0x67e8f9, 30, 30);
    this.light.position.set(0, 3, 2);
    this.group.add(this.light);

    this.group.position.set(0, 1.4, 0);
    this.group.rotation.x = 0.35;
    // fit the lotus into the visible width: petal tips reach ≈ ±3.15 m, but a
    // portrait phone (vertical FOV) shows only ≈ ±1.8 m at this distance —
    // shrink the whole flower rather than cropping the outer petals
    const cam = ctx.camera;
    const halfW = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * cam.aspect * 6.5;
    const fit = Math.min(1, (halfW * 0.95) / 3.15);
    if (fit < 1) this.group.scale.setScalar(fit);
    ctx.scene.add(this.group);
    ctx.camera.position.set(0, 2.2, 6.5);
    ctx.camera.lookAt(0, 1.4, 0);

    this.emitState(false);
  }

  private emitState(done: boolean): void {
    const state: BreathState = {
      phase: this.phase,
      cycle: this.cycle,
      totalCycles: this.totalCycles,
      openness: this.openness,
      done,
    };
    this.ctx.events.emit("breath:state", state);
  }

  update(dt: number): void {
    if (this.disposed) return;
    this.phaseT += dt;
    const phaseLen = this.phaseLen;

    if (this.phaseT >= phaseLen) {
      this.phaseT = 0;
      this.stepIdx++;
      if (this.stepIdx >= this.pattern.steps.length) {
        this.stepIdx = 0;
        this.cycle++;
        if (this.cycle >= this.totalCycles) {
          this.emitState(true);
          const seconds = Math.round((performance.now() - this.startedAt) / 1000);
          this.ctx.finish({
            game: "breath",
            score: this.totalCycles,
            detail: `${this.totalCycles} циклов · ${this.pattern.label} · ${seconds} с`,
          });
          return;
        }
      }
      const nowPhase = this.phase;
      if (nowPhase === "out") this.ctx.audio.sfx("whoosh");
      else if (nowPhase === "hold") this.ctx.audio.sfx("tick");
      this.emitState(false);
    }

    // smooth openness: ease in/out; freeze while holding the breath
    const k = Math.min(1, this.phaseT / phaseLen);
    const eased = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    if (this.phase === "in") this.openness = eased;
    else if (this.phase === "out") this.openness = 1 - eased;
    // "hold" keeps the lotus exactly where the previous phase left it

    const s = 0.72 + this.openness * 0.5;
    this.group.scale.setScalar(s);
    for (const petal of this.petals) {
      const ring = petal.userData.ring as number;
      petal.rotation.x = -0.15 - this.openness * (ring === 0 ? 0.75 : 0.55);
    }
    const coreMat = this.core.material as THREE.MeshStandardMaterial;
    coreMat.emissiveIntensity = 0.45 + this.openness * 0.9;
    this.light.intensity = 16 + this.openness * 30;

    this.emitThrottled();
  }

  private lastEmit = 0;
  private emitThrottled(): void {
    const now = performance.now();
    if (now - this.lastEmit > 120) {
      this.lastEmit = now;
      this.emitState(false);
    }
  }

  pointer(): void {
    /* breathing needs no pointer input — hands free, eyes soft */
  }

  exit(): void {
    this.disposed = true;
    this.ctx.scene.remove(this.group);
    for (const petal of this.petals) {
      petal.geometry.dispose();
      (petal.material as THREE.Material).dispose();
    }
    this.core.geometry.dispose();
    (this.core.material as THREE.Material).dispose();
    this.petals = [];
  }
}
