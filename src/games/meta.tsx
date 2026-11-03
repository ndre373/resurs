/**
 * meta.tsx — catalogue of the eight games: names, channels, accents, icons.
 */

import type { ReactNode } from "react";
import { Type, Palette, Ear, Wind, Orbit, Drum, PenTool, MoveDiagonal } from "lucide-react";
import type { Difficulty, GameId } from "@/game/types";

export interface GameMeta {
  id: GameId;
  title: string;
  subtitle: string;
  channels: string[];
  icon: ReactNode;
  accent: string;
  bestLabel: string;
  /** One-line explanation of what each difficulty tier changes in this game. */
  diffHint: Record<Difficulty, string>;
  /** DOM games get the brighter ambient mode; 3D scenes manage their own energy. */
  isDom: boolean;
}

export const GAME_META: Record<GameId, GameMeta> = {
  alphabet: {
    id: "alphabet",
    title: "Алфавит",
    subtitle: "левая · правая · обе — на скорость",
    channels: ["зрение", "кинестетика", "полушария"],
    icon: <Type size={26} />,
    accent: "#5eead4",
    bestLabel: "верно",
    diffHint: {
      easy: "окно ответа 4,2 с — мягкий разгон",
      mid: "окно ответа 3,2 с — классический темп",
      hard: "окно ответа 2,4 с — быстрый разгон",
    },
    isDom: true,
  },
  stroop: {
    id: "stroop",
    title: "Радуга",
    subtitle: "цвет против слова — диссонанс",
    channels: ["зрение", "диссонанс"],
    icon: <Palette size={26} />,
    accent: "#c084fc",
    bestLabel: "верно",
    diffHint: {
      easy: "6 секунд на каждое слово",
      mid: "4 секунды на каждое слово",
      hard: "2,6 секунды на каждое слово",
    },
    isDom: true,
  },
  echo: {
    id: "echo",
    title: "Эхо",
    subtitle: "цепочки звуков и света",
    channels: ["слух", "зрение", "память"],
    icon: <Ear size={26} />,
    accent: "#67e8f9",
    bestLabel: "звуков",
    diffHint: {
      easy: "медленные вспышки — каждые 0,85 с",
      mid: "вспышки каждые 0,62 с",
      hard: "быстрые вспышки — 0,46 с, и сфер шесть",
    },
    isDom: false,
  },
  breath: {
    id: "breath",
    title: "Дыхание",
    subtitle: "лотос 5/5 — перезагрузка",
    channels: ["кинестетика", "эмоции"],
    icon: <Wind size={26} />,
    accent: "#7dd3fc",
    bestLabel: "циклов",
    diffHint: {
      easy: "подсказки ведут первые 5 циклов",
      mid: "подсказки в первых 3 циклах",
      hard: "подсказки только в 1-м цикле — дальше сам",
    },
    isDom: false,
  },
  flow: {
    id: "flow",
    title: "Поток",
    subtitle: "полёт искры сквозь кольца",
    channels: ["зрение", "кинестетика", "поток"],
    icon: <Orbit size={26} />,
    accent: "#f0abfc",
    bestLabel: "колец",
    diffHint: {
      easy: "спокойный полёт — скорость −25 %",
      mid: "обычная скорость полёта",
      hard: "быстрый полёт — скорость +30 %",
    },
    isDom: false,
  },
  rhythm: {
    id: "rhythm",
    title: "Ритм",
    subtitle: "барабаны двух рук",
    channels: ["тактильность", "слух", "полушария"],
    icon: <Drum size={26} />,
    accent: "#fbbf24",
    bestLabel: "шагов",
    diffHint: {
      easy: "бит 70 ударов в минуту",
      mid: "бит 84 удара в минуту",
      hard: "бит 100 ударов в минуту",
    },
    isDom: true,
  },
  mirror: {
    id: "mirror",
    title: "Зеркало",
    subtitle: "симметричное рисование",
    channels: ["тактильность", "зрение", "полушария"],
    icon: <PenTool size={26} />,
    accent: "#fb7185",
    bestLabel: "штрихов",
    diffHint: {
      easy: "две зеркальные кисти",
      mid: "две зеркальные кисти",
      hard: "сразу 4 кисти — режим калейдоскопа",
    },
    isDom: true,
  },
  cross: {
    id: "cross",
    title: "Кросс",
    subtitle: "диагонали — две руки разом",
    channels: ["тактильность", "зрение", "полушария"],
    icon: <MoveDiagonal size={26} />,
    accent: "#34d399",
    bestLabel: "пар",
    diffHint: {
      easy: "окно ответа +30 %, мягче синхрон",
      mid: "классические окна и синхрон",
      hard: "окно ответа −25 %, строже синхрон",
    },
    isDom: true,
  },
};

export const GAME_ORDER: GameId[] = [
  "alphabet",
  "stroop",
  "echo",
  "rhythm",
  "cross",
  "flow",
  "breath",
  "mirror",
];
