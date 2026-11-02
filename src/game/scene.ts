/**
 * scene.ts — contract between the controller and the interactive 3D scenes
 * (breath / echo / flow). DOM-driven games only use the ambient background
 * and particle bursts, so they need no scene object.
 */

import type * as THREE from "three";
import type { AudioEngine } from "./audio";
import type { Emitter } from "./emitter";
import type { GameResult } from "./types";

export interface SceneContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  audio: AudioEngine;
  events: Emitter;
  /** Report the session result; the controller relays it to the React layer. */
  finish: (result: GameResult) => void;
}

export interface GameScene {
  enter(ctx: SceneContext): void;
  exit(): void;
  update(dt: number, t: number): void;
  /** Normalized device coords (-1..1). */
  pointer?(x: number, y: number, kind: "down" | "move" | "up"): void;
}
