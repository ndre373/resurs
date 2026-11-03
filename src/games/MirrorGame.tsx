/**
 * MirrorGame — free symmetric drawing over the starfield: every stroke you make
 * is mirrored live (2-way or 4-way kaleidoscope), colour breathes with movement,
 * soft bells follow your hand. Both hemispheres draw at once. Tactile + visual.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { controller } from "@/game/boot";
import { voice } from "@/game/voice";
import type { Difficulty, GameResult } from "@/game/types";
import { HowTo } from "@/ui/common";
import { pInterval, pClear } from "@/game/pause";

const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5];

function pluralStrokes(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return `${n} штрих`;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return `${n} штриха`;
  return `${n} штрихов`;
}

export function MirrorGame(props: {
  onDone: (r: GameResult) => void;
  /** Session mode / ready-gate time: finish automatically after N seconds. */
  autoFinishSec?: number;
  /** Hard mode starts in the 4-way kaleidoscope. */
  difficulty?: Difficulty;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fourWay, setFourWay] = useState(props.difficulty === "hard");
  const [secondsLeft, setSecondsLeft] = useState(props.autoFinishSec ?? 0);
  const [strokes, setStrokes] = useState(0);

  const draw = useRef({
    hue: 190,
    strokes: 0,
    startedAt: performance.now(),
    lastBell: 0,
    done: false,
  });
  // Every active finger paints its own line with its own colour offset —
  // two-handed bilateral drawing, as in the classic practice
  const pointers = useRef(new Map<number, { x: number; y: number; hueOff: number }>());
  const nextHueOff = useRef(0);
  const fourWayRef = useRef(fourWay);
  fourWayRef.current = fourWay;

  // hypnotic prompter: start cue
  useEffect(() => {
    voice.setContext("mirror");
    voice.cue("Позвольте руке рисовать… свободно…", controller.audio.muted);
    return () => voice.setContext(null);
  }, []);

  const finish = useCallback(() => {
    const d = draw.current;
    if (d.done) return;
    d.done = true;
    const seconds = Math.round((performance.now() - d.startedAt) / 1000);
    controller.audio.sfx("complete");
    props.onDone({
      game: "mirror",
      score: d.strokes,
      detail: `${pluralStrokes(d.strokes)} · ${seconds} с рисования`,
      difficulty: props.difficulty ?? "mid",
    });
  }, [props]);

  // auto-finish countdown (session mode)
  useEffect(() => {
    if (!props.autoFinishSec) return;
    setSecondsLeft(props.autoFinishSec);
    const id = pInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          pClear(id);
          finish();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => pClear(id);
  }, [props.autoFinishSec, finish]);

  // canvas setup + resize
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio, 2);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  const paintSegment = (x0: number, y0: number, x1: number, y1: number, w: number, hue: number) => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const color = `hsl(${hue}, 85%, 68%)`;
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;

    const mirrors: Array<[number, number, number, number]> = [[x0, y0, x1, y1]];
    mirrors.push([W - x0, y0, W - x1, y1]); // vertical mirror
    if (fourWayRef.current) {
      mirrors.push([x0, H - y0, x1, H - y1]);
      mirrors.push([W - x0, H - y0, W - x1, H - y1]);
    }
    ctx.beginPath();
    for (const [ax, ay, bx, by] of mirrors) {
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
    }
    ctx.stroke();
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const d = draw.current;
    if (d.done) return;
    // each new finger gets the next colour offset (0°, 140°, 260°, …)
    pointers.current.set(e.pointerId, {
      x: e.clientX,
      y: e.clientY,
      hueOff: nextHueOff.current,
    });
    nextHueOff.current = (nextHueOff.current + 140) % 360;
    d.strokes++;
    setStrokes(d.strokes);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    controller.audio.bell(controller.audio.now(), PENTA[d.strokes % PENTA.length], 0.08);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = draw.current;
    if (d.done) return;
    const p = pointers.current.get(e.pointerId);
    if (!p) return;
    const dist = Math.hypot(e.clientX - p.x, e.clientY - p.y);
    if (dist < 2) return;
    d.hue = (d.hue + dist * 0.12) % 360;
    const w = Math.max(2, 9 - dist * 0.08);
    paintSegment(p.x, p.y, e.clientX, e.clientY, w, (d.hue + p.hueOff) % 360);
    p.x = e.clientX;
    p.y = e.clientY;
    // bells follow the primary hand only — two chiming hands turn to noise
    if (e.isPrimary) {
      const now = performance.now();
      if (now - d.lastBell > 380 && dist > 12) {
        d.lastBell = now;
        const idx = Math.min(PENTA.length - 1, Math.floor((e.clientX / window.innerWidth) * PENTA.length));
        controller.audio.bell(controller.audio.now(), PENTA[idx], 0.045);
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
  };

  const clear = () => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    controller.audio.sfx("ui");
  };

  return (
    <div className="mirror-stage">
      <canvas
        ref={canvasRef}
        className="mirror-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      <div className="mirror-top">
        <HowTo>
          <p>
            Рисуйте свободно — <b>можно двумя пальцами сразу</b>: у каждого своя линия и свой цвет,
            руки работают одновременно, как в классической билатеральной практике. Каждый штрих
            зеркалится. Здесь нет ошибок — есть только поток.
          </p>
        </HowTo>
        <div className="mirror-stats">
          {props.autoFinishSec ? `осталось ${secondsLeft} с · ` : ""}
          {pluralStrokes(strokes)}
        </div>
      </div>
      <div className="mirror-bottom">
        <button className="btn ghost" onClick={clear} aria-label="Очистить рисунок">
          Очистить
        </button>
        <button
          className={`btn ${fourWay ? "primary" : "ghost"}`}
          onClick={() => setFourWay((v) => !v)}
          aria-label="Переключить калейдоскоп: два или четыре отражения"
          aria-pressed={fourWay}
        >
          Калейдоскоп ×4
        </button>
        {!props.autoFinishSec && (
          <button className="btn primary" onClick={finish} aria-label="Завершить рисование">
            Завершить
          </button>
        )}
      </div>
    </div>
  );
}
