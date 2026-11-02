/**
 * boot.ts — contract with the React shell (src/pages/Home.tsx):
 *   startGame(canvas)  mounts the 3D runtime onto the existing <canvas>
 *   stopGame()         tears everything down
 * Calling startGame twice is safe. All gameplay lives behind the controller.
 */

import { controller } from "./controller";

declare global {
  interface Window {
    __GAME_READY__?: boolean;
    /** Test/debug hook: the live game controller (used by the verify scripts). */
    __game?: typeof controller;
  }
}

export function startGame(canvas: HTMLCanvasElement): void {
  controller.start(canvas);
  window.__game = controller;
}

export function stopGame(): void {
  controller.dispose();
}

export { controller };
