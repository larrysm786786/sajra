import { useEffect, useRef, useState } from "react";
import type { Language } from "./types";
import { t } from "./i18n";

type Props = {
  language: Language;
  onFinish: () => void;
};

export default function OnboardingVideo({ language, onFinish }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [muted, setMuted] = useState(true);
  const [videoFailed, setVideoFailed] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = true;
    // A blocked autoplay attempt is not a media failure; native controls let the user start it.
    void video.play().catch(() => undefined);
    return () => video.pause();
  }, []);

  function toggleSound() {
    const video = videoRef.current;
    if (!video) return;
    const nextMuted = !muted;
    video.muted = nextMuted;
    setMuted(nextMuted);
  }

  return (
    <section className="sajra-onboarding" role="dialog" aria-modal="true" aria-labelledby="sajra-onboarding-title">
      <div className="sajra-onboarding-card">
        <div className="sajra-onboarding-heading">
          <img src={`${import.meta.env.BASE_URL}logo.jpg`} alt="" />
          <div>
            <p>{t(language, "onboardingEyebrow")}</p>
            <h1 id="sajra-onboarding-title">{step === 1 ? t(language, "onboardingTitle") : t(language, "onboardingNextTitle")}</h1>
          </div>
          <button className="sajra-onboarding-skip" type="button" onClick={onFinish}>{t(language, "onboardingSkip")}</button>
        </div>

        {step === 1 ? (
          <>
            <p className="sajra-onboarding-subtitle">{t(language, "onboardingSubtitle")}</p>
            {videoFailed ? (
              <div className="sajra-onboarding-video-error" role="status">{t(language, "onboardingVideoError")}</div>
            ) : (
              <div className="sajra-onboarding-video-wrap">
                <video
                  ref={videoRef}
                  className="sajra-onboarding-video"
                  src={`${import.meta.env.BASE_URL}media/apna-sajra-onboarding-with-music.mp4`}
                  autoPlay
                  muted
                  playsInline
                  controls
                  preload="metadata"
                  onError={() => setVideoFailed(true)}
                  onVolumeChange={(event) => setMuted(event.currentTarget.muted)}
                  aria-label={t(language, "onboardingVideoLabel")}
                />
                <button className="sajra-onboarding-sound" type="button" onClick={toggleSound} aria-pressed={!muted}>
                  {t(language, muted ? "onboardingSoundOn" : "onboardingSoundOff")}
                </button>
              </div>
            )}
            <div className="sajra-onboarding-actions">
              <span>{t(language, "onboardingStepOne")}</span>
              <button className="btn" type="button" onClick={() => setStep(2)}>{t(language, "onboardingNext")}</button>
            </div>
          </>
        ) : (
          <>
            <p className="sajra-onboarding-subtitle">{t(language, "onboardingNextSubtitle")}</p>
            <ul className="sajra-onboarding-highlights">
              <li>{t(language, "onboardingHighlightTree")}</li>
              <li>{t(language, "onboardingHighlightProfiles")}</li>
              <li>{t(language, "onboardingHighlightPhotos")}</li>
            </ul>
            <div className="sajra-onboarding-actions">
              <button className="btn-ghost" type="button" onClick={() => setStep(1)}>{t(language, "onboardingBack")}</button>
              <button className="btn" type="button" onClick={onFinish}>{t(language, "onboardingStart")}</button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
