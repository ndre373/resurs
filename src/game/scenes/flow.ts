/**
 * scenes/flow.ts — 3D flow game: you are a spark of light gliding forward
 * through an endless starfield; steer with the pointer to pass through the
 * luminous rings. Speed ramps, combos build, attention narrows — the classic
 * flow channel. Visual + kinesthetic.
 */

import * as THREE from "three";
import { FLOW } from "../config";
import type { GameScene, SceneContext } from "../scene";

export interface FlowHudState {
  hits: number;
  combo: number;
  bestCombo: number;
  timeLeft: number;
  speed: number;
}

interface Ring {
  mesh: THREE.Mesh<THREE.TorusGeometry, THREE.MeshStandardMaterial>;
  glow: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  center: THREE.Vector2;
  judged: boolean;
  fade: number; // >0 while fading out after judgement
}

export class FlowScene implements GameScene {
  constructor(durationSec?: number) {
    if (durationSec && durationSec > 0) this.duration = durationSec;
  }

  private ctx!: SceneContext;
  private duration: number = FLOW.DURATION_S;
  private orb!: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  private orbLight!: THREE.PointLight;
  private trail!: THREE.Points;
  private trailGeo!: THREE.BufferGeometry;
  private trailPos = 0;
  private rings: Ring[] = [];
  private ringGroup = new THREE.Group();
  private stars!: THREE.Points;
  private starsGeo!: THREE.BufferGeometry;

  private target = new THREE.Vector2(0, 1.6);
  private elapsed = 0;
  private hits = 0;
  private combo = 0;
  private bestCombo = 0;
  private spawnZ = -70;
  private nextRingZ = 0;
  private disposed = false;
  private finished = false;
  private lastHud = 0;

  enter(ctx: SceneContext): void {
    this.ctx = ctx;

    // player spark
    this.orb = new THREE.Mesh(
      new THREE.SphereGeometry(0.34, 24, 18),
      new THREE.MeshStandardMaterial({
        color: 0x5eead4,
        emissive: 0x2dd4bf,
        emissiveIntensity: 1.4,
        roughness: 0.2,
      }),
    );
    this.orb.position.set(0, 1.6, 0);
    ctx.scene.add(this.orb);
    this.orbLight = new THREE.PointLight(0x5eead4, 24, 16);
    this.orb.add(this.orbLight);

    // spark trail (pooled)
    this.trailGeo = new THREE.BufferGeometry();
    const tp = new Float32Array(90 * 3);
    for (let i = 0; i < 90; i++) tp[i * 3 + 1] = -100;
    this.trailGeo.setAttribute("position", new THREE.BufferAttribute(tp, 3));
    this.trail = new THREE.Points(
      this.trailGeo,
      new THREE.PointsMaterial({
        color: 0x5eead4,
        size: 0.1,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.trail.frustumCulled = false;
    ctx.scene.add(this.trail);

    // starfield rushing by
    this.starsGeo = new THREE.BufferGeometry();
    const sp = new Float32Array(420 * 3);
    for (let i = 0; i < 420; i++) {
      sp[i * 3] = (Math.random() - 0.5) * 30;
      sp[i * 3 + 1] = Math.random() * 12 - 2;
      sp[i * 3 + 2] = -Math.random() * 90;
    }
    this.starsGeo.setAttribute("position", new THREE.BufferAttribute(sp, 3));
    this.stars = new THREE.Points(
      this.starsGeo,
      new THREE.PointsMaterial({
        color: 0xa5b4fc,
        size: 0.07,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    ctx.scene.add(this.stars);

    ctx.scene.add(this.ringGroup);
    ctx.camera.position.set(0, 2.0, 5.2);
    ctx.camera.lookAt(0, 1.7, -8);

    this.nextRingZ = -14;
    this.emitHud();
  }

  pointer(x: number, y: number, kind: "down" | "move" | "up"): void {
    // Steer on any pointer contact: a touch only reports moves while the
    // finger is on the screen, and a mouse should steer by simply moving —
    // holding the button down is not required.
    if (kind === "up") return;
    // NDC → world plane at z=0, clamped to the corridor that is actually
    // VISIBLE on this screen (the corridor width follows the camera aspect)
    const reach = this.orbReach();
    this.target.set(
      THREE.MathUtils.clamp(x * reach, -reach, reach),
      THREE.MathUtils.clamp(1.6 + y * 3.4, 0.3, 4.4),
    );
  }

  /**
   * Visible half-width at the judgement plane (z=0). The camera FOV is
   * vertical, so a portrait phone (aspect ≈ 0.47) sees only ≈ ±1.5 m there,
   * while a wide desktop sees ±5.6 m. Ring centers and the steering clamp are
   * derived from this — otherwise edge rings are off-screen and unhittable.
   */
  private halfWidth(): number {
    const cam = this.ctx.camera;
    return Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * cam.aspect * 5.2;
  }

  /** How far the spark may steer sideways — stays inside the visible frame. */
  private orbReach(): number {
    return Math.min(4, Math.max(0.8, this.halfWidth() - 0.4));
  }

  /** Ring centers: far enough apart to be interesting, never beyond reach. */
  private ringSpan(): number {
    return Math.min(3.6, Math.max(0.6, this.halfWidth() - 0.5));
  }

  private spawnCount = 0;

  private spawnRing(): void {
    const geo = new THREE.TorusGeometry(FLOW.RING_RADIUS, 0.09, 14, 48);
    const hue = (this.spawnCount++ * 47) % 360;
    const color = new THREE.Color(`hsl(${hue}, 80%, 68%)`);
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        color: color.getHex(),
        emissive: color.getHex(),
        emissiveIntensity: 0.9,
        roughness: 0.3,
        transparent: true,
      }),
    );
    const glow = new THREE.Mesh(
      new THREE.TorusGeometry(FLOW.RING_RADIUS, 0.2, 10, 48),
      new THREE.MeshBasicMaterial({
        color: color.getHex(),
        transparent: true,
        opacity: 0.22,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    const center = new THREE.Vector2(
      (Math.random() - 0.5) * 2 * this.ringSpan(),
      0.6 + Math.random() * 3.6,
    );
    mesh.position.set(center.x, center.y, this.spawnZ);
    glow.position.copy(mesh.position);
    this.ringGroup.add(mesh, glow);
    this.rings.push({ mesh, glow, center, judged: false, fade: 0 });
  }

  private speed(): number {
    const k = Number.isFinite(this.duration)
      ? Math.min(1, this.elapsed / this.duration)
      : Math.min(1, this.elapsed / 120); // бесконечный режим: скорость выходит на плато за 2 минуты
    return FLOW.START_SPEED + (FLOW.MAX_SPEED - FLOW.START_SPEED) * k;
  }

  private emitHud(): void {
    const state: FlowHudState = {
      hits: this.hits,
      combo: this.combo,
      bestCombo: this.bestCombo,
      timeLeft: Number.isFinite(this.duration)
        ? Math.max(0, Math.ceil(this.duration - this.elapsed))
        : Math.floor(this.elapsed), // в бесконечном режиме показываем прошедшее время
      speed: this.speed(),
    };
    this.ctx.events.emit("flow:state", state);
  }

  update(dt: number): void {
    if (this.disposed || this.finished) return;
    this.elapsed += dt;
    const v = this.speed();

    // orb follows the pointer target smoothly
    this.orb.position.x += (this.target.x - this.orb.position.x) * Math.min(1, dt * 7);
    this.orb.position.y += (this.target.y - this.orb.position.y) * Math.min(1, dt * 7);
    this.orb.rotation.z = -(this.target.x - this.orb.position.x) * 0.6;

    // trail: drop a point each frame, recycle
    const tp = (this.trailGeo.getAttribute("position") as THREE.BufferAttribute);
    tp.setXYZ(this.trailPos, this.orb.position.x, this.orb.position.y, this.orb.position.z + 0.3);
    tp.needsUpdate = true;
    this.trailPos = (this.trailPos + 1) % 90;

    // stars rush toward the camera
    const sp = this.starsGeo.getAttribute("position") as THREE.BufferAttribute;
    const spArr = sp.array as Float32Array;
    for (let i = 0; i < 420; i++) {
      spArr[i * 3 + 2] += v * dt;
      if (spArr[i * 3 + 2] > 6) spArr[i * 3 + 2] = -90;
    }
    sp.needsUpdate = true;

    // rings
    this.nextRingZ += v * dt;
    if (this.nextRingZ >= FLOW.RING_GAP) {
      this.nextRingZ = 0;
      this.spawnRing();
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const ring = this.rings[i];
      ring.mesh.position.z += v * dt;
      ring.glow.position.z = ring.mesh.position.z;
      ring.mesh.rotation.z += dt * 0.8;
      ring.glow.rotation.z = ring.mesh.rotation.z;

      if (!ring.judged && ring.mesh.position.z >= 0) {
        ring.judged = true;
        ring.fade = 0.7;
        const d = Math.hypot(
          this.orb.position.x - ring.center.x,
          this.orb.position.y - ring.center.y,
        );
        if (d <= FLOW.HIT_RADIUS) {
          this.hits++;
          this.combo++;
          this.bestCombo = Math.max(this.bestCombo, this.combo);
          this.ctx.audio.sfx("ring");
          ring.mesh.material.emissiveIntensity = 3;
        } else {
          this.combo = 0;
          this.ctx.audio.sfx("bad");
        }
        this.emitHud();
      }
      if (ring.judged) {
        ring.fade -= dt;
        const op = Math.max(0, ring.fade / 0.7);
        ring.mesh.material.opacity = op;
        (ring.glow.material as THREE.MeshBasicMaterial).opacity = 0.22 * op;
        if (ring.fade <= 0) {
          this.ringGroup.remove(ring.mesh, ring.glow);
          ring.mesh.geometry.dispose();
          ring.mesh.material.dispose();
          ring.glow.geometry.dispose();
          (ring.glow.material as THREE.Material).dispose();
          this.rings.splice(i, 1);
        }
      } else if (ring.mesh.position.z > 8) {
        // safety: un-judged ring behind the camera
        ring.judged = true;
        ring.fade = 0.01;
      }
    }

    const now = performance.now();
    if (now - this.lastHud > 250) {
      this.lastHud = now;
      this.emitHud();
    }

    if (this.elapsed >= this.duration) {
      this.finished = true;
      this.ctx.audio.sfx("complete");
      this.ctx.finish({
        game: "flow",
        score: this.hits,
        detail: `${this.hits} колец · лучшая серия ${this.bestCombo}`,
      });
    }
  }

  exit(): void {
    this.disposed = true;
    const scene = this.ctx.scene;
    scene.remove(this.orb, this.trail, this.stars, this.ringGroup);
    this.orb.geometry.dispose();
    this.orb.material.dispose();
    this.trailGeo.dispose();
    (this.trail.material as THREE.Material).dispose();
    this.starsGeo.dispose();
    (this.stars.material as THREE.Material).dispose();
    for (const ring of this.rings) {
      ring.mesh.geometry.dispose();
      ring.mesh.material.dispose();
      ring.glow.geometry.dispose();
      (ring.glow.material as THREE.Material).dispose();
    }
    this.rings = [];
  }
}
