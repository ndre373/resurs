/**
 * regression.test.ts — guards for bugs that already bit us once:
 *
 * 1. Echo never puts the same orb twice in a row (two flashes 620 ms apart
 *    merge into one — such a chain is unplayable).
 * 2. Echo lays out ALL orbs inside the visible frame on a portrait phone
 *    (edge orbs used to sit off-screen: the tone played, no flash visible).
 * 3. Flow keeps ring centers and the steering reach inside the visible
 *    corridor on a portrait phone.
 */

import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { EchoScene } from "./scenes/echo";
import { FlowScene } from "./scenes/flow";

const PHONE_ASPECT = 0.47; // typical portrait phone (≈ 9:19.5)

function stubCtx(aspect = PHONE_ASPECT) {
  const camera = new THREE.PerspectiveCamera(62, aspect, 0.1, 200);
  const calls = { bells: 0 };
  return {
    scene: new THREE.Scene(),
    camera,
    calls,
    audio: {
      bell: () => {
        calls.bells++;
      },
      sfx: () => {},
      now: () => 0,
    },
    events: { emit: () => {} },
    finish: () => {},
  };
}

describe("echo scene", () => {
  it("never repeats the same orb twice in a row", () => {
    const e = new EchoScene(16);
    const ctx = stubCtx();
    e.enter(ctx as never);
    try {
      for (let n = 0; n < 60; n++) {
        (e as never as { newLevel(l: number): void }).newLevel(3 + (n % 14));
        const seq = (e as never as { sequence: number[] }).sequence;
        for (let i = 1; i < seq.length; i++) {
          expect(seq[i]).not.toBe(seq[i - 1]);
        }
      }
    } finally {
      e.exit();
    }
  });

  it("keeps every orb inside the frame on a portrait phone", () => {
    const e = new EchoScene(12);
    const ctx = stubCtx(PHONE_ASPECT);
    e.enter(ctx as never);
    try {
      const cam = ctx.camera;
      cam.updateMatrixWorld();
      cam.updateProjectionMatrix();
      const orbs = (e as never as { orbs: { mesh: THREE.Mesh }[] }).orbs;
      expect(orbs.length).toBe(5);
      for (const o of orbs) {
        const p = o.mesh.position.clone().project(cam);
        // NDC x within ±1 is on-screen; leave a small margin for the orb radius
        expect(Math.abs(p.x)).toBeLessThanOrEqual(0.95);
        expect(p.y).toBeGreaterThanOrEqual(-1);
        expect(p.y).toBeLessThanOrEqual(1);
      }
    } finally {
      e.exit();
    }
  });
});

describe("flow scene", () => {
  it("keeps ring centers reachable on a portrait phone", () => {
    const f = new FlowScene(60);
    const ctx = stubCtx(PHONE_ASPECT);
    f.enter(ctx as never);
    try {
      const span = (f as never as { ringSpan(): number }).ringSpan();
      for (let n = 0; n < 80; n++) {
        (f as never as { spawnRing(): void }).spawnRing();
      }
      const rings = (f as never as { rings: { center: THREE.Vector2 }[] }).rings;
      expect(rings.length).toBe(80);
      for (const r of rings) {
        expect(Math.abs(r.center.x)).toBeLessThanOrEqual(span + 1e-6);
      }
      // steering: the far screen edge maps to the corridor edge, never beyond
      (f as never as { pointer(x: number, y: number, k: string): void }).pointer(1, 0, "move");
      const target = (f as never as { target: THREE.Vector2 }).target;
      const reach = (f as never as { orbReach(): number }).orbReach();
      expect(Math.abs(target.x)).toBeLessThanOrEqual(reach + 1e-6);
    } finally {
      f.exit();
    }
  });
});
