/**
 * scenes/echo.ts — 3D audio-memory game. Five resonant orbs in an arc;
 * the app plays a growing pentatonic sequence (glow + tone), the player
 * repeats it by tapping the orbs. Auditory + visual channel, focused attention.
 */

import * as THREE from "three";
import { COLORS, ECHO } from "../config";
import type { GameScene, SceneContext } from "../scene";

const ORB_FREQS = [523.25, 587.33, 659.25, 783.99, 880]; // C5 D5 E5 G5 A5

export interface EchoHudState {
  phase: "watch" | "repeat" | "success" | "fail";
  level: number;
  best: number;
  inputCount: number;
}

interface Orb {
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  baseEmissive: number;
  flash: number; // seconds remaining of highlight
  index: number;
}

export class EchoScene implements GameScene {
  /** maxLen — длина цепочки, на которой игра завершается победой (выбор времени). */
  constructor(private readonly maxLen: number = ECHO.MAX_LEN) {}

  private ctx!: SceneContext;
  private group = new THREE.Group();
  private orbs: Orb[] = [];
  private raycaster = new THREE.Raycaster();
  private pointerNdc = new THREE.Vector2();
  private sequence: number[] = [];
  private inputPos = 0;
  private showIndex = -1;
  private showTimer = 0;
  private phase: "watch" | "repeat" | "success" | "fail" = "watch";
  private phasePause = 0;
  private best = 0;
  private strikes = 0;
  private disposed = false;

  enter(ctx: SceneContext): void {
    this.ctx = ctx;
    const geo = new THREE.SphereGeometry(0.62, 32, 24);
    for (let i = 0; i < 5; i++) {
      const color = COLORS.palette[i % COLORS.palette.length];
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: 0.35,
          roughness: 0.25,
          metalness: 0.2,
        }),
      );
      const angle = THREE.MathUtils.degToRad(-56 + i * 28);
      mesh.position.set(Math.sin(angle) * 4.4, 1.7, -Math.cos(angle) * 1.6);
      this.group.add(mesh);
      this.orbs.push({ mesh, baseEmissive: 0.35, flash: 0, index: i });

      // soft halo ring under each orb
      const halo = new THREE.Mesh(
        new THREE.RingGeometry(0.72, 0.8, 40),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.25,
          side: THREE.DoubleSide,
        }),
      );
      halo.position.copy(mesh.position);
      halo.position.y -= 1.0;
      halo.rotation.x = -Math.PI / 2;
      this.group.add(halo);
    }
    ctx.scene.add(this.group);
    ctx.camera.position.set(0, 2.1, 7.5);
    ctx.camera.lookAt(0, 1.5, 0);
    this.newLevel(ECHO.START_LEN);
  }

  private newLevel(len: number): void {
    this.sequence = [];
    for (let i = 0; i < len; i++) {
      // never the same orb twice in a row: two identical flashes 620 ms apart
      // merge into one long glow (and the bells overlap) — such a chain is
      // impossible to read, the player can't tell 1 tap from 2
      let orb: number;
      do {
        orb = (Math.random() * this.orbs.length) | 0;
      } while (i > 0 && orb === this.sequence[i - 1]);
      this.sequence.push(orb);
    }
    this.replay();
  }

  /** Re-show the current sequence from the start (after a mistake — same chain again). */
  private replay(): void {
    this.phase = "watch";
    this.showIndex = -1;
    this.showTimer = 0.6; // short pause before the sequence starts
    this.inputPos = 0;
    this.emitHud();
  }

  private emitHud(): void {
    const state: EchoHudState = {
      phase: this.phase,
      level: this.sequence.length,
      best: this.best,
      inputCount: this.inputPos,
    };
    this.ctx.events.emit("echo:state", state);
  }

  private flashOrb(i: number, loud: boolean): void {
    const orb = this.orbs[i];
    orb.flash = 0.45;
    // gameplay cue → the loud sfx channel, well above the ducked music bed.
    // Short 0.55 s decay: flashes come every 620 ms, a longer tail would
    // overlap the next orb and blur which sound belongs to which flash.
    if (loud) this.ctx.audio.bell(this.ctx.audio.now(), ORB_FREQS[i], 0.17, "sfx", 0.55);
    else this.ctx.audio.sfx("pluck");
  }

  pointer(x: number, y: number, kind: "down" | "move" | "up"): void {
    if (kind !== "down" || this.phase !== "repeat" || this.disposed) return;
    this.pointerNdc.set(x, y);
    this.raycaster.setFromCamera(this.pointerNdc, this.ctx.camera);
    const hits = this.raycaster.intersectObjects(this.orbs.map((o) => o.mesh));
    if (!hits.length) return;
    const orb = this.orbs.find((o) => o.mesh === hits[0].object);
    if (!orb) return;

    this.flashOrb(orb.index, true);
    if (orb.index === this.sequence[this.inputPos]) {
      this.inputPos++;
      if (this.inputPos >= this.sequence.length) {
        this.best = Math.max(this.best, this.sequence.length);
        this.phase = "success";
        this.phasePause = 1.2;
        this.ctx.audio.sfx("complete");
      }
    } else {
      this.strikes++;
      this.phase = "fail";
      this.phasePause = 1.4;
      this.ctx.audio.sfx("bad");
    }
    this.emitHud();
  }

  update(dt: number): void {
    if (this.disposed) return;

    for (const orb of this.orbs) {
      const mat = orb.mesh.material;
      if (orb.flash > 0) {
        orb.flash -= dt;
        mat.emissiveIntensity = 0.35 + Math.max(0, orb.flash) * 3.2;
        orb.mesh.scale.setScalar(1 + Math.max(0, orb.flash) * 0.35);
      } else {
        mat.emissiveIntensity = orb.baseEmissive;
        orb.mesh.scale.setScalar(1);
      }
      orb.mesh.rotation.y += dt * 0.6;
    }

    if (this.phase === "watch") {
      this.showTimer -= dt;
      if (this.showTimer <= 0) {
        this.showIndex++;
        if (this.showIndex >= this.sequence.length) {
          this.phase = "repeat";
          this.inputPos = 0;
          this.emitHud();
        } else {
          this.flashOrb(this.sequence[this.showIndex], true);
          this.showTimer = ECHO.SHOW_MS / 1000;
          this.emitHud();
        }
      }
    } else if (this.phase === "success" || this.phase === "fail") {
      this.phasePause -= dt;
      if (this.phasePause <= 0) {
        if (this.phase === "success") {
          const next = this.sequence.length + 1;
          if (next > this.maxLen) {
            this.ctx.finish({
              game: "echo",
              score: this.best,
              detail: `максимальная цепочка ${this.best} звуков · ошибок ${this.strikes}`,
            });
            return;
          }
          this.newLevel(next);
        } else {
          if (this.strikes >= 3) {
            this.ctx.finish({
              game: "echo",
              score: this.best,
              detail: `цепочка до ${this.best} звуков · 3 ошибки`,
            });
            return;
          }
          this.replay(); // same chain once more — as the HUD promises
        }
      }
    }
  }

  exit(): void {
    this.disposed = true;
    this.ctx.scene.remove(this.group);
    for (const orb of this.orbs) {
      orb.mesh.geometry.dispose();
      orb.mesh.material.dispose();
    }
    this.orbs = [];
  }
}
