/**
 * SettingsView — the single place for every adjustable preference:
 * sound (volumes, voice, affirmations, binaural), haptics, the default
 * exercise duration, and data management (progress/sync, stats reset).
 */

import { useState, type ReactNode } from "react";
import {
  Music,
  Mic,
  Quote,
  Waves,
  Volume2,
  VolumeX,
  Vibrate,
  Timer,
  Flame,
  Trash2,
  Info,
} from "lucide-react";
import { controller } from "@/game/boot";
import { voice } from "@/game/voice";
import {
  getDefaultDuration,
  setDefaultDuration,
  hapticsEnabled,
  setHapticsEnabled,
} from "@/game/settings";
import { DURATION_OPTIONS } from "./common";

function Section(props: { title: string; children: ReactNode }) {
  return (
    <div className="settings-section">
      <div className="settings-section-title">{props.title}</div>
      <div className="settings-card">{props.children}</div>
    </div>
  );
}

function ToggleRow(props: {
  icon: ReactNode;
  title: string;
  sub?: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      className="settings-row"
      onClick={props.onToggle}
      role="switch"
      aria-checked={props.on}
    >
      <span className="settings-row-icon">{props.icon}</span>
      <span className="settings-row-text">
        <span className="settings-row-title">{props.title}</span>
        {props.sub && <span className="settings-row-sub">{props.sub}</span>}
      </span>
      <span className={`switch ${props.on ? "on" : ""}`}>
        <span className="switch-knob" />
      </span>
    </button>
  );
}

function SliderRow(props: {
  icon: ReactNode;
  title: string;
  value: number; // 0..1
  onChange: (v: number) => void;
}) {
  return (
    <div className="settings-row settings-row-slider">
      <span className="settings-row-icon">{props.icon}</span>
      <span className="settings-row-text">
        <span className="settings-row-title">
          {props.title} · {Math.round(props.value * 100)}%
        </span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(props.value * 100)}
          aria-label={props.title}
          onChange={(e) => props.onChange(Number(e.target.value) / 100)}
        />
      </span>
    </div>
  );
}

export function SettingsView(props: {
  onGoProgress: () => void;
  onStatsReset: () => void;
}) {
  const [muted, setMuted] = useState(controller.audio.muted);
  const [binaural, setBinaural] = useState(controller.audio.binauralOn);
  const [voiceOn, setVoiceOn] = useState(voice.voiceOn);
  const [affirmOn, setAffirmOn] = useState(voice.affirmationsOn);
  const [musicVol, setMusicVol] = useState(controller.audio.musicVolume);
  const [voiceVol, setVoiceVol] = useState(voice.speechVolume);
  const [haptics, setHaptics] = useState(hapticsEnabled());
  const [duration, setDuration] = useState(getDefaultDuration());

  return (
    <div className="settings-view">
      <Section title="Звук">
        <ToggleRow
          icon={muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          title="Звук"
          sub={muted ? "всё выключено" : "музыка и звуки включены"}
          on={!muted}
          onToggle={() => setMuted(controller.audio.toggleMute())}
        />
        <SliderRow
          icon={<Music size={18} />}
          title="Музыка"
          value={musicVol}
          onChange={(v) => {
            setMusicVol(v);
            controller.audio.setMusicVolume(v);
          }}
        />
        <SliderRow
          icon={<Mic size={18} />}
          title="Голос"
          value={voiceVol}
          onChange={(v) => {
            setVoiceVol(v);
            voice.setSpeechVolume(v);
          }}
        />
        <ToggleRow
          icon={<Mic size={18} />}
          title="Суфлёр"
          sub="короткие голосовые подсказки в упражнениях"
          on={voiceOn}
          onToggle={() => setVoiceOn(voice.toggleVoice())}
        />
        <ToggleRow
          icon={<Quote size={18} />}
          title="Аффирмации"
          sub="мягкие фразы поверх музыки каждые 45–75 секунд"
          on={affirmOn}
          onToggle={() => setAffirmOn(voice.toggleAffirmations())}
        />
        <ToggleRow
          icon={<Waves size={18} />}
          title="Бинауральный ритм"
          sub="альфа-частота 10 Гц — слышен в наушниках"
          on={binaural}
          onToggle={() => setBinaural(controller.audio.toggleBinaural())}
        />
      </Section>

      <Section title="Ощущения">
        <ToggleRow
          icon={<Vibrate size={18} />}
          title="Виброотклик"
          sub="лёгкая вибрация на касания и результаты (Android)"
          on={haptics}
          onToggle={() => {
            const v = !haptics;
            setHapticsEnabled(v);
            setHaptics(v);
          }}
        />
      </Section>

      <Section title="Длительность упражнений">
        <div className="settings-duration">
          <div className="settings-row-text" style={{ padding: "2px 4px 10px" }}>
            <span className="settings-row-sub">
              Стартовая длительность для «Дыхания» и «Потока» — её всегда можно поменять
              прямо в упражнении.
            </span>
          </div>
          <div className="chips">
            {DURATION_OPTIONS.map((m) => (
              <button
                key={m}
                className={`chip ${duration === m ? "on" : ""}`}
                onClick={() => {
                  setDuration(m);
                  setDefaultDuration(m);
                }}
              >
                {m === 0 ? "∞" : `${m} мин`}
              </button>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Данные">
        <button className="settings-row" onClick={props.onGoProgress}>
          <span className="settings-row-icon">
            <Flame size={18} />
          </span>
          <span className="settings-row-text">
            <span className="settings-row-title">Прогресс и синхронизация</span>
            <span className="settings-row-sub">
              история, серии дней, перенос между устройствами по коду
            </span>
          </span>
        </button>
        <button
          className="settings-row danger"
          onClick={() => {
            if (window.confirm("Сбросить всю статистику практики? Действие необратимо.")) {
              props.onStatsReset();
            }
          }}
        >
          <span className="settings-row-icon">
            <Trash2 size={18} />
          </span>
          <span className="settings-row-text">
            <span className="settings-row-title">Сбросить статистику</span>
            <span className="settings-row-sub">рекорды, история и серии дней на этом устройстве</span>
          </span>
        </button>
      </Section>

      <div className="settings-foot">
        <Info size={14} />
        <span>
          «Ресурс» — тренажёр состояния, а не медицинский продукт. Наушники усилят эффект.
          Настройки хранятся на этом устройстве.
        </span>
      </div>
    </div>
  );
}
