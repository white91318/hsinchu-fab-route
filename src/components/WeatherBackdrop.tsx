"use client";

import { useEffect, useRef } from "react";
import type { WeatherState } from "@/lib/weather/types";

interface Drop {
  x: number;
  y: number;
  len: number;
  speed: number;
  alpha: number;
}

interface Mote {
  x: number;
  y: number;
  r: number;
  drift: number;
  phase: number;
  alpha: number;
}

/**
 * The sky behind the map, drawn rather than loaded: a canvas scene costs about
 * a kilobyte of code instead of megabytes of GIF, stays sharp at any density,
 * and can simply stop when the viewer asks for reduced motion. Each state gets
 * its own scene; the readable ink colour over each one is set in CSS on
 * `.map-pane[data-weather]`, so the map's labels stay legible on every sky.
 */
export function WeatherBackdrop({ state }: { state: WeatherState }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = canvasRef.current;
    if (!element) return;
    const context = element.getContext("2d");
    if (!context) return;
    // Alias after the guards: TypeScript re-widens narrowed captures inside the
    // nested drawing functions, so both handles are re-bound as non-nullable.
    const canvas: HTMLCanvasElement = element;
    const ctx: CanvasRenderingContext2D = context;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let width = 0;
    let height = 0;
    let drops: Drop[] = [];
    let motes: Mote[] = [];
    let raf = 0;
    let last = performance.now();

    function seed() {
      if (state === "rain") {
        const count = Math.round((width * height) / 1400);
        drops = Array.from({ length: count }, () => ({
          x: Math.random() * width,
          y: Math.random() * height,
          len: 9 + Math.random() * 16,
          speed: 260 + Math.random() * 320,
          alpha: 0.16 + Math.random() * 0.34,
        }));
      } else {
        const density = state === "clear" ? 9000 : 16000;
        const count = Math.round((width * height) / density);
        motes = Array.from({ length: count }, () => ({
          x: Math.random() * width,
          y: Math.random() * height,
          r: 1 + Math.random() * 2.4,
          drift: 6 + Math.random() * 16,
          phase: Math.random() * Math.PI * 2,
          alpha: 0.12 + Math.random() * 0.24,
        }));
      }
    }

    function resize() {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    }

    function fillVertical(stops: Array<[number, string]>) {
      const g = ctx.createLinearGradient(0, 0, 0, height);
      stops.forEach(([at, color]) => g.addColorStop(at, color));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, width, height);
    }

    function drawRain(dt: number) {
      fillVertical([
        [0, "#28323d"],
        [0.55, "#3b4a58"],
        [1, "#55697a"],
      ]);
      ctx.lineWidth = 1.2;
      ctx.lineCap = "round";
      for (const d of drops) {
        d.y += d.speed * dt;
        d.x += d.speed * dt * 0.18;
        if (d.y > height + d.len) {
          d.y = -d.len;
          d.x = Math.random() * width;
        }
        if (d.x > width + 10) d.x = -10;
        ctx.strokeStyle = `rgba(226, 240, 250, ${d.alpha})`;
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - d.len * 0.18, d.y - d.len);
        ctx.stroke();
      }
    }

    function drawClear(now: number, dt: number) {
      fillVertical([
        [0, "#7fb6e4"],
        [0.5, "#bcd9ee"],
        [1, "#f0e2c2"],
      ]);
      const cx = width * 0.78;
      const cy = height * 0.15;
      const pulse = 1 + Math.sin(now / 2600) * 0.05;
      const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, width * 0.62 * pulse);
      halo.addColorStop(0, "rgba(255, 236, 179, 0.95)");
      halo.addColorStop(0.22, "rgba(252, 214, 130, 0.45)");
      halo.addColorStop(1, "rgba(252, 214, 130, 0)");
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, width, height);

      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(12, width * 0.045), 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 248, 224, 0.96)";
      ctx.fill();

      driftMotes(now, dt, "rgba(255, 252, 235, ");
    }

    function drawCloudy(now: number, dt: number) {
      fillVertical([
        [0, "#93a1ad"],
        [0.55, "#b3bec8"],
        [1, "#d3d8dc"],
      ]);
      // Three slow bands stand in for overcast layers; no sun disc, which is
      // what separates this from the clear scene at a glance.
      for (let i = 0; i < 3; i++) {
        const y = height * (0.18 + i * 0.24) + Math.sin(now / (5200 + i * 1400)) * height * 0.02;
        const band = ctx.createLinearGradient(0, y - height * 0.12, 0, y + height * 0.12);
        band.addColorStop(0, "rgba(255, 255, 255, 0)");
        band.addColorStop(0.5, `rgba(255, 255, 255, ${0.16 - i * 0.03})`);
        band.addColorStop(1, "rgba(255, 255, 255, 0)");
        ctx.fillStyle = band;
        ctx.fillRect(0, y - height * 0.12, width, height * 0.24);
      }
      driftMotes(now, dt, "rgba(255, 255, 255, ");
    }

    function driftMotes(now: number, dt: number, rgbPrefix: string) {
      for (const m of motes) {
        m.x += Math.sin(now / 3000 + m.phase) * m.drift * dt;
        m.y -= m.drift * dt * 0.4;
        if (m.y < -4) {
          m.y = height + 4;
          m.x = Math.random() * width;
        }
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
        ctx.fillStyle = `${rgbPrefix}${m.alpha})`;
        ctx.fill();
      }
    }

    function frame(now: number) {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      if (state === "rain") drawRain(dt);
      else if (state === "clear") drawClear(now, dt);
      else drawCloudy(now, dt);

      // A reduced-motion viewer still gets the sky, just held still.
      if (!reduced) raf = requestAnimationFrame(frame);
    }

    resize();
    raf = requestAnimationFrame(frame);

    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            resize();
            if (reduced) raf = requestAnimationFrame(frame);
          })
        : null;
    observer?.observe(canvas);

    return () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
    };
  }, [state]);

  return <canvas ref={canvasRef} className="weather-canvas" aria-hidden="true" />;
}
