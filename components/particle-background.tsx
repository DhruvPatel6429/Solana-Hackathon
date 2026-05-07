"use client";

import Particles, { initParticlesEngine } from "@tsparticles/react";
import { loadSlim } from "@tsparticles/slim";
import { useEffect, useState } from "react";

export function ParticleBackground() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    initParticlesEngine(async (engine) => {
      await loadSlim(engine);
    }).then(() => setReady(true));
  }, []);

  if (!ready) return null;

  return (
    <Particles
      className="absolute inset-0 -z-10"
      options={{
        fullScreen: false,
        background: { color: "transparent" },
        particles: {
          number: { value: 70, density: { enable: true } },
          color: { value: ["#7C3AED", "#10B981"] },
          links: { enable: true, color: "#7C3AED", opacity: 0.18, distance: 130 },
          move: { enable: true, speed: 0.55 },
          opacity: { value: { min: 0.2, max: 0.65 } },
          size: { value: { min: 1, max: 3 } },
        },
      }}
    />
  );
}
