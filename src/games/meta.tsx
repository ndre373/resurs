/**
 * meta.tsx — catalogue of the eight games: names, channels, accents, icons.
 */

import type { ReactNode } from "react";
import { Type, Palette, Ear, Wind, Orbit, Drum, PenTool, MoveDiagonal } from "lucide-react";
import type { GameId } from "@/game/types";

export interface GameMeta {
  id: GameId;
  title: string;
  subtitle: string;
  channels: string[];
  icon: ReactNode;
  accent: string;
  bestLabel: string;
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
