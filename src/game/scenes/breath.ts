/**
 * scenes/breath.ts — 3D breathing pacer with three visuals:
 *  - «lotus»: the classic flower of petals opens on the inhale, closes on the
 *    exhale — now multicoloured, with a hue-cycling core;
 *  - «spiral»: a hypnotic shader spiral that rotates and expands on the inhale;
 *  - «ripples»: water rings that breathe outward on the inhale and settle back
 *    on the exhale.
 * Coherent 5s/5s rhythm by default; phase events drive the HUD label, the
 * gliding tones and the phase-change haptics. Parasympathetic reset.
 */

import * as THREE from "three";
import { BREATH, COLORS } from "../config";
import type { GameScene, SceneContext } from "../scene";
import { BREATH_PATTERNS, type BreathPattern, type BreathPhase } from "../breathPatterns";

export interface BreathState {
  phase: BreathPhase;
  cycle: number;
  totalCycles: number;
  /** 0..1 openness of the visual. */
  openness: number;
  done: boolean;
}

export type BreathVisual = "lotus" | "spiral" | "ripples";

const QUAD_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const QUAD_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;   // seconds since scene start
  uniform float uOpen;   // 0..1 breath openness
  uniform float uAspect; // viewport aspect, keeps the pattern circular
  uniform float uMode;   // 0 = spiral, 1 = ripples

  // calm cosmic palette cycle (teal → violet → pink)
  vec3 pal(float t) {
    return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67)));
  }

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    p.x *= uAspect;
    float r = length(p);
    float a = atan(p.y, p.x);
    vec3 col;
    float alpha;
    if (uMode < 0.5) {
      // hypnotic spiral: always rotates; inhale expands and brightens it
      float turn = uTime * (0.5 + uOpen * 0.9);
      float s = sin(a * 3.0 + r * (18.0 - uOpen * 6.0) - turn * 2.2);
      float band = smoothstep(-0.2, 0.9, s);
      col = mix(pal(uTime * 0.03 + r * 0.25), pal(uTime * 0.03 + r * 0.25 + 0.45), band);
      float glow = exp(-r * 1.9) * (0.35 + uOpen * 0.85);
      alpha = clamp(glow * 1.6, 0.0, 0.95);
      col *= glow * 1.7;
    } else {
      // water rings: the inhale pushes rings outward, the exhale draws them in
      float w = sin(r * 26.0 - uOpen * 9.0 - uTime * 0.4);
      float ring = smoothstep(0.55, 0.95, w);
      col = mix(pal(0.52 + r * 0.15 + uTime * 0.02), pal(0.75 + r * 0.1), ring);
      float glow = exp(-r * 1.6) * (0.3 + uOpen * 0.7);
      alpha = clamp(glow * (0.35 + ring * 0.8), 0.0, 0.9);
      col *= glow * 1.6;
    }
    gl_FragColor = vec4(col, alpha);
  }
`;

export class BreathScene implements GameScene {
  constructor(
    cycles?: number,
    pattern?: BreathPattern,
    visual?: BreathVisual,
  ) {
    if (cycles && cycles > 0) this.totalCycles = cycles;
    if (pattern) this.pattern = pattern;
    if (visual) this.visual = visual;
  }

  private ctx!: SceneContext;
  private group = new THREE.Group();
  private petals: THREE.Mesh[] = [];
  private core: THREE.Mesh | null = null;
  private light: THREE.PointLight | null = null;
  private quad: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> | null = null;
  private pattern: BreathPattern = BREATH_PATTERNS[0];
  private visual: BreathVisual = "lotus";
  private stepIdx = 0;
  private phaseT = 0;
  private cycle = 0;
  private totalCycles: number = BREATH.DEFAULT_CYCLES;
  private openness = 0;
  private disposed = false;
  private startedAt = 0;
  private time = 0;
  /** Screen-fit factor computed in enter() — update() multiplies it back in. */
  private fitScale = 1;
  /** Aspect the quad was sized for — refit when the phone rotates. */
  private quadAspect = 0;

  private get phase(): BreathPhase {
    return this.pattern.steps[this.stepIdx].phase;
  }
  private get phaseLen(): number {
    return this.pattern.steps[this.stepIdx].sec;
  }

  enter(ctx: SceneContext): void {
    this.ctx = ctx;
    this.startedAt = performance.now();

    if (this.visual === "lotus") this.buildLotus();
    else this.buildQuad(this.visual === "spiral" ? 0 : 1);

    this.group.position.set(0, 1.4, 0);
    ctx.scene.add(this.group);
    ctx.camera.position.set(0, 2.2, 6.5);
    ctx.camera.lookAt(0, 1.4, 0);

    this.emitState(false);
  }

  /** The classic pacer — now every petal carries its own palette colour. */
  private buildLotus(): void {
    const petalGeo = new THREE.SphereGeometry(1, 20, 12);
    petalGeo.scale(0.55, 0.16, 1.35);
    for (let ring = 0; ring < 2; ring++) {
      const n = ring === 0 ? 8 : 12;
      const radius = ring === 0 ? 1.15 : 1.8;
      for (let i = 0; i < n; i++) {
        const color = COLORS.palette[(i + ring * 2) % COLORS.palette.length];
        const mat = new THREE.MeshStandardMaterial({
          color,
          emissive: color,
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

    this.group.rotation.x = 0.35;
    // fit the lotus into the visible width: petal tips reach ≈ ±3.15 m, but a
    // portrait phone (vertical FOV) shows only ≈ ±1.8 m at this distance —
    // shrink the whole flower rather than cropping the outer petals.
    // update() multiplies this factor back in every frame.
    const cam = this.ctx.camera;
    const halfW = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * cam.aspect * 6.5;
    this.fitScale = Math.min(1, (halfW * 0.95) / 3.15);
  }

  /** Full-screen shader visual (spiral / ripples) behind the HUD. */
  private buildQuad(mode: number): void {
    const cam = this.ctx.camera;
    const dist = 6.55; // camera → focus point distance
    const halfH = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * dist;
    const halfW = halfH * cam.aspect;
    const mat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: QUAD_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uOpen: { value: 0 },
        uAspect: { value: cam.aspect },
        uMode: { value: mode },
      },
      transparent: true,
      depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(halfW * 2.1, halfH * 2.1), mat);
    this.quad.position.set(0, 1.4, 0);
    this.quad.lookAt(cam.position);
    // straight into the scene, not the breathing group — the group's scale
    // pulse belongs to the lotus and must not stretch the shader plane
    this.ctx.scene.add(this.quad);
    this.quadAspect = cam.aspect;
  }

  /** Refit the shader quad after a rotation/resize. */
  private refitQuad(): void {
    if (!this.quad) return;
    const cam = this.ctx.camera;
    const dist = 6.55;
    const halfH = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * dist;
    const halfW = halfH * cam.aspect;
    this.quad.geometry.dispose();
    this.quad.geometry = new THREE.PlaneGeometry(halfW * 2.1, halfH * 2.1);
    this.quad.material.uniforms.uAspect.value = cam.aspect;
    this.quad.lookAt(cam.position);
    this.quadAspect = cam.aspect;
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
    this.time += dt;
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
    // "hold" keeps the visual exactly where the previous phase left it

    if (this.quad) {
      if (this.ctx.camera.aspect !== this.quadAspect) this.refitQuad();
      this.quad.material.uniforms.uTime.value = this.time;
      this.quad.material.uniforms.uOpen.value = this.openness;
    } else {
      const s = 0.72 + this.openness * 0.5;
      this.group.scale.setScalar(this.fitScale * s);
      for (const petal of this.petals) {
        const ring = petal.userData.ring as number;
        petal.rotation.x = -0.15 - this.openness * (ring === 0 ? 0.75 : 0.55);
      }
      // the core breathes through the palette — slow hue cycle
      if (this.core) {
        const coreMat = this.core.material as THREE.MeshStandardMaterial;
        const hue = (this.time * 0.04) % 1;
        coreMat.emissive.setHSL(hue, 0.75, 0.55);
        coreMat.color.setHSL(hue, 0.6, 0.7);
        coreMat.emissiveIntensity = 0.45 + this.openness * 0.9;
      }
      if (this.light) {
        this.light.color.setHSL((this.time * 0.04 + 0.5) % 1, 0.7, 0.6);
        this.light.intensity = 16 + this.openness * 30;
      }
    }

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
    this.petals = [];
    if (this.core) {
      this.core.geometry.dispose();
      (this.core.material as THREE.Material).dispose();
      this.core = null;
    }
    if (this.light) this.light = null;
    if (this.quad) {
      this.ctx.scene.remove(this.quad);
      this.quad.geometry.dispose();
      this.quad.material.dispose();
      this.quad = null;
    }
  }
}
