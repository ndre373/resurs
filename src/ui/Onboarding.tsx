/**
 * Onboarding — three short hints shown once on the very first launch:
 * headphones, the "don't think, just respond" principle, and where the
 * progress lives. Dismissal is persisted; the card never appears again.
 */

import { useState } from "react";
import { Headphones, BrainCircuit, CloudUpload, ArrowRight, Sparkles } from "lucide-react";
import { storage } from "@/game/storage";

const KEY = "onboarded";

export function onboardingNeeded(): boolean {
  return !storage.get<boolean>(KEY, false);
}

function markOnboardingDone(): void {
  storage.set(KEY, true);
}

const STEPS = [
  {
    icon: Headphones,
    title: "Наденьте наушники",
    text: "Музыка, бинауральный ритм 10 Гц и голосовой суфлёр синтезируются прямо в приложении — в наушниках эффект заметно глубже. Громкость настраивается в шторке сверху и в «Настройках».",
  },
  {
    icon: BrainCircuit,
    title: "Отвечайте быстро, не думая",
    text: "Игры построены так, чтобы сознание не успевало контролировать — тогда включаются оба полушария сразу. Ошибки не страшны: они часть перезагрузки. Любое упражнение можно поставить на паузу.",
  },
  {
    icon: CloudUpload,
    title: "Прогресс — только ваш",
    text: "Статистика и серии дней хранятся на этом устройстве. Перенос на телефон или компьютер — по короткому коду на экране «Прогресс», без аккаунтов и регистрации.",
  },
] as const;

export function Onboarding(props: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const last = step === STEPS.length - 1;
  const Icon = STEPS[step].icon;

  const finish = () => {
    markOnboardingDone();
    props.onDone();
  };

  return (
    <div
      className="modal-backdrop onboard-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Знакомство с приложением"
    >
      <div className="modal-card onboard-card">
        <div className="onboard-icon">
          <Icon size={34} />
        </div>
        <div className="onboard-title">{STEPS[step].title}</div>
        <p className="onboard-text">{STEPS[step].text}</p>
        <div className="onboard-dots" aria-hidden="true">
          {STEPS.map((_, i) => (
            <span key={i} className={`onboard-dot ${i === step ? "on" : ""}`} />
          ))}
        </div>
        <div className="modal-actions">
          <button className="btn primary" onClick={() => (last ? finish() : setStep(step + 1))}>
            {last ? (
              <>
                Начать <Sparkles size={16} />
              </>
            ) : (
              <>
                Далее <ArrowRight size={16} />
              </>
            )}
          </button>
          {!last && (
            <button className="link-btn" onClick={finish}>
              Пропустить
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
