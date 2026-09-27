"use client";

import { useMemo, useSyncExternalStore } from "react";
import { Particles, ParticlesProvider, type ParticlesPluginRegistrar } from "@tsparticles/react";
import { loadSlim } from "@tsparticles/slim";
import type { ISourceOptions } from "@tsparticles/engine";

// Literal hex (mirrors app/globals.css's HUD --series-1 / --series-7) — the
// particle engine's config can't read CSS custom properties, the same
// reason lib/chart-theme.ts duplicates them for ECharts.
const ORB_COLORS = ["#35b8ff", "#b18bff"];
const STAR_COLOR = "#8fd8ff";

const initEngine: ParticlesPluginRegistrar = async (engine) => {
  await loadSlim(engine);
};

function subscribeReducedMotion(onChange: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function useReducedMotion() {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false // SSR snapshot: no window, assume motion allowed until hydrated
  );
}

/**
 * Full sci-fi HUD backdrop: a perspective grid floor, a drifting starfield,
 * and a couple of soft ambient glow orbs. Mounted once at the dashboard
 * layout level, not per-page. Replaces the old plain aurora-background.
 */
export function HudBackground() {
  const reducedMotion = useReducedMotion();

  const orbOptions: ISourceOptions = useMemo(
    () => ({
      fullScreen: { enable: false },
      fpsLimit: 30,
      detectRetina: true,
      particles: {
        number: { value: 5 },
        color: { value: ORB_COLORS },
        shape: { type: "circle" },
        opacity: { value: 0.28 },
        size: { value: { min: 140, max: 240 } },
        move: {
          enable: !reducedMotion,
          speed: 0.25,
          direction: "none",
          random: true,
          straight: false,
          outModes: { default: "bounce" },
        },
        links: { enable: false },
      },
      interactivity: { events: { onHover: { enable: false }, onClick: { enable: false } } },
    }),
    [reducedMotion]
  );

  const starOptions: ISourceOptions = useMemo(
    () => ({
      fullScreen: { enable: false },
      fpsLimit: 30,
      detectRetina: true,
      particles: {
        number: { value: 70 },
        color: { value: STAR_COLOR },
        shape: { type: "circle" },
        opacity: { value: { min: 0.15, max: 0.7 }, animation: { enable: !reducedMotion, speed: 0.6, sync: false } },
        size: { value: { min: 0.5, max: 1.6 } },
        move: { enable: !reducedMotion, speed: 0.06, direction: "none", random: true, straight: false },
        links: { enable: false },
      },
      interactivity: { events: { onHover: { enable: false }, onClick: { enable: false } } },
    }),
    [reducedMotion]
  );

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[var(--surface-0)]">
      {/* Starfield */}
      <ParticlesProvider init={initEngine}>
        <Particles id="hud-stars" options={starOptions} style={{ width: "100%", height: "100%" }} />
      </ParticlesProvider>

      {/* Ambient glow orbs, heavily blurred */}
      <div className="absolute inset-0" style={{ filter: "blur(90px)" }}>
        <ParticlesProvider init={initEngine}>
          <Particles id="hud-orbs" options={orbOptions} style={{ width: "100%", height: "100%" }} />
        </ParticlesProvider>
      </div>

      {/* Perspective grid floor, anchored bottom, fading into the horizon */}
      <div
        className="absolute inset-x-0 bottom-0"
        style={{
          height: "45vh",
          perspective: "300px",
          maskImage: "linear-gradient(to top, black, transparent)",
          WebkitMaskImage: "linear-gradient(to top, black, transparent)",
        }}
      >
        <div
          className={reducedMotion ? undefined : "hud-grid-scroll"}
          style={{
            position: "absolute",
            inset: "-100% -50% 0 -50%",
            transform: "rotateX(75deg)",
            transformOrigin: "bottom",
            backgroundImage:
              "linear-gradient(rgba(53,184,255,0.16) 1px, transparent 1px), linear-gradient(90deg, rgba(53,184,255,0.16) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
      </div>

      {/* Top vignette so panels near the header stay high-contrast */}
      <div
        className="absolute inset-x-0 top-0 h-40"
        style={{ background: "linear-gradient(to bottom, var(--surface-0), transparent)" }}
      />

      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          @keyframes hud-grid-scroll { from { background-position-y: 0; } to { background-position-y: 48px; } }
          .hud-grid-scroll { animation: hud-grid-scroll 2.4s linear infinite; }
        }
      `}</style>
    </div>
  );
}
