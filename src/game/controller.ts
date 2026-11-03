/**
 * controller.ts — the single owner of the 3D runtime: renderer, loop,
 * ambient background, particle bursts, the active game scene and the audio
 * engine. The React layer talks to the game world only through this object.
 */

import * as THREE from "three";
import { GameLoop } from "./engine";
import { AudioEngine } from "./audio";
import { Emitter } from "./emitter";
import { BackgroundFX } from "./background";
import { BurstFX } from "./burst";
import { COLORS } from "./config";
import type { GameScene, SceneContext } from "./scene";
import type { GameResult, SceneName } from "./types";
import type { BreathPattern } from "./breathPatterns";
import { voice } from "./voice";
import { pauseBus } from "./pause";

/** Energy presets: how bright the music and the particle field feel. */
const ENERGY: Record<string, number> = {
  menu: 0.3,
  dom: 0.55, // DOM games (alphabet/stroop/rhythm/mirror)
  breath: 0.12,
  echo: 0.5,
  flow: 0.85,
};

class Controller {
  audio = new AudioEngine();
  readonly events = new Emitter();

  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private loop: GameLoop | null = null;
  private background: BackgroundFX | null = null;
  private bursts: BurstFX | null = null;
  private active: GameScene | null = null;
  private activeName: SceneName | null = null;
  /** Generation token: discards a lazy scene load if the user already left. */
  private sceneToken = 0;
  private cameraHome = new THREE.Vector3(0, 2.0, 7.5);
  private cameraDriftT = 0;
  /** OS «reduce motion» setting — skip the idle camera drift and heavy bursts. */
  private reducedMotion =
    typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  private elapsed = 0;
  private energy = ENERGY.menu;
  private fpsAcc = 0;
  private fpsN = 0;
  private fpsLowT = 0;
  private removePointerListeners: Array<() => void> = [];

  get running(): boolean {
    return this.renderer !== null;
  }

  start(canvas: HTMLCanvasElement): void {
    if (this.renderer) return;
    if (this.audio.disposed) this.audio = new AudioEngine();
    voice.setAudio(this.audio); // voice ducks the music bed while speaking
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      preserveDrawingBuffer: true, // lets the self-check read pixels back
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.setClearColor(COLORS.background);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(COLORS.background, 0.028);
    const camera = new THREE.PerspectiveCamera(
      62,
      window.innerWidth / window.innerHeight,
      0.1,
      200,
    );
    camera.position.copy(this.cameraHome);
    camera.lookAt(0, 1.4, 0);

    scene.add(new THREE.AmbientLight(0x8899ff, 0.7));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(3, 6, 4);
    scene.add(key);

    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.background = new BackgroundFX(scene);
    this.bursts = new BurstFX(scene);
    this.setMode("menu");

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight, false);
    };
    window.addEventListener("resize", onResize);
    this.removePointerListeners.push(() => window.removeEventListener("resize", onResize));

    // pointer → NDC → active scene.
    // NOTE: the DOM overlay (.game-body) sits above the canvas and swallows
    // pointerdown on empty areas, so the listener lives on window; taps that
    // land on real UI controls (buttons, chips, cards) are filtered out and
    // never reach the 3D scene.
    const toNdc = (e: PointerEvent): [number, number] => [
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1,
    ];
    const isUiChrome = (e: PointerEvent): boolean => {
      const t = e.target as HTMLElement | null;
      return !!t?.closest?.(
        "button, a, input, select, textarea, [role='button'], .modal-card, .pause-card, .howto",
      );
    };
    const down = (e: PointerEvent) => {
      if (isUiChrome(e)) return;
      const [x, y] = toNdc(e);
      this.active?.pointer?.(x, y, "down");
    };
    const move = (e: PointerEvent) => {
      const [x, y] = toNdc(e);
      this.active?.pointer?.(x, y, "move");
    };
    const up = (e: PointerEvent) => {
      const [x, y] = toNdc(e);
      this.active?.pointer?.(x, y, "up");
    };
    window.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    this.removePointerListeners.push(() => {
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    });

    this.loop = new GameLoop({
      update: (dt) => this.update(dt),
      render: () => {
        renderer.render(scene, camera);
        window.__GAME_READY__ = true;
      },
    });
    this.loop.start();
  }

  private update(dt: number): void {
    this.elapsed += dt;
    this.background?.setEnergy(this.energy);
    this.audio.energy = this.energy;
    this.background?.update(dt);
    this.bursts?.update(dt);
    // paused exercise: the active scene freezes, ambience keeps breathing
    if (!pauseBus.paused) {
      this.active?.update(dt, this.elapsed);
      voice.maybeAffirm(this.audio.muted);
    }

    // idle camera drift when no scene owns the camera (off for reduced motion)
    if (!this.active && this.camera && !this.reducedMotion) {
      this.cameraDriftT += dt;
      const c = this.camera;
      c.position.x = Math.sin(this.cameraDriftT * 0.12) * 1.2;
      c.position.y = 2.0 + Math.sin(this.cameraDriftT * 0.2) * 0.25;
      c.lookAt(0, 1.4, 0);
    }

    // fps watchdog → degrade particle count once, keep 60fps
    this.fpsAcc += dt;
    this.fpsN++;
    if (this.fpsAcc >= 1) {
      const fps = this.fpsN / this.fpsAcc;
      this.fpsAcc = 0;
      this.fpsN = 0;
      if (fps < 45) {
        this.fpsLowT++;
        if (this.fpsLowT >= 2) this.background?.degrade();
      } else {
        this.fpsLowT = 0;
      }
    }
  }

  /** Ambient intensity for menus and DOM games. */
  setMode(mode: "menu" | "dom"): void {
    this.energy = ENERGY[mode];
  }

  /** Lazy scene modules — each scene code-splits into its own chunk. */
  private static async createScene(
    name: SceneName,
    opts?: {
      cycles?: number;
      durationSec?: number;
      breathPattern?: BreathPattern;
      maxLen?: number;
      showMs?: number;
      speedScale?: number;
      orbCount?: number;
    },
  ): Promise<GameScene> {
    if (name === "breath") {
      const m = await import("./scenes/breath");
      return new m.BreathScene(opts?.cycles, opts?.breathPattern);
    }
    if (name === "echo") {
      const m = await import("./scenes/echo");
      return new m.EchoScene({
        maxLen: opts?.maxLen,
        durationSec: opts?.durationSec,
        showMs: opts?.showMs,
        orbCount: opts?.orbCount,
      });
    }
    const m = await import("./scenes/flow");
    return new m.FlowScene(opts?.durationSec, opts?.speedScale);
  }

  enterScene(
    name: SceneName,
    opts?: {
      cycles?: number;
      durationSec?: number;
      breathPattern?: BreathPattern;
      maxLen?: number;
      showMs?: number;
      speedScale?: number;
      orbCount?: number;
    },
  ): void {
    this.exitScene();
    pauseBus.set(false); // a fresh scene never starts paused
    if (!this.scene || !this.camera) return;
    const token = ++this.sceneToken;
    const ctx: SceneContext = {
      scene: this.scene,
      camera: this.camera,
      audio: this.audio,
      events: this.events,
      finish: (result: GameResult) => {
        this.events.emit("scene:done", result);
      },
    };
    this.activeName = name;
    this.energy = ENERGY[name];
    void Controller.createScene(name, opts).then((scene) => {
      // the user left (or re-entered) while the chunk was loading — drop it
      if (token !== this.sceneToken || !this.scene || !this.camera) return;
      this.active = scene;
      scene.enter(ctx);
    });
  }

  exitScene(): void {
    this.sceneToken++; // invalidate any in-flight lazy load
    this.active?.exit();
    this.active = null;
    this.activeName = null;
    voice.stop();
    if (this.camera) {
      this.camera.position.copy(this.cameraHome);
      this.camera.lookAt(0, 1.4, 0);
    }
  }

  get sceneName(): SceneName | null {
    return this.activeName;
  }

  /** Particle feedback for DOM games. */
  burst(side: -1 | 0 | 1, good: boolean, count?: number): void {
    const n = this.reducedMotion && count !== undefined ? Math.min(count, 10) : count;
    this.bursts?.fire(side, good, n);
  }

  dispose(): void {
    this.exitScene();
    this.loop?.stop();
    this.loop = null;
    for (const off of this.removePointerListeners) off();
    this.removePointerListeners = [];
    if (this.scene) {
      this.background?.dispose(this.scene);
      this.bursts?.dispose(this.scene);
    }
    this.background = null;
    this.bursts = null;
    this.renderer?.dispose();
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.events.clear();
    this.audio.stopMusic();
    this.audio.dispose();
    voice.stop();
    window.__GAME_READY__ = false;
  }
}

export const controller = new Controller();
