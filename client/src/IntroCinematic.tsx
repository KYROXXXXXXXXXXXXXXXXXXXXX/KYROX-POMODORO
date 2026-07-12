import { useEffect, useRef, useState } from 'react';

// Cinematic fully rendered on <canvas>: volumetric fog, embers, a feather that
// really writes the infinity symbol in liquid silver, forge flash, crimson
// ornamental circle, final energy pulse with camera push.
// Drop a pre-rendered client/public/intro.mp4 to replace it automatically.

const CUE = {
  fog: 400,
  feather: 1800,
  write: 3800,
  forge: 7200,
  circle: 9000,
  align: 11200,
  pulse: 13300,
  end: 15300,
} as const;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (v: number) => v * v * (3 - 2 * v);
const easeOut = (v: number) => 1 - (1 - v) ** 3;
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  max: number;
  kind: 'ember' | 'spark' | 'burst';
  silver?: boolean;
}

// Stylized quill, tip at local (0, 60), plume up to (0, -62).
const FEATHER = new Path2D(
  'M0,-62 C18,-42 24,-12 8,26 C15,20 21,11 25,1 C21,26 11,45 0,60 C-11,45 -21,26 -25,1 C-21,11 -15,20 -8,26 C-24,-12 -18,-42 0,-62 Z',
);

export function IntroCinematic({ onDone }: { onDone: () => void }) {
  const [useVideo, setUseVideo] = useState<boolean | null>(null);
  const [showSkip, setShowSkip] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const finished = useRef(false);

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    onDone();
  };

  useEffect(() => {
    const id = setTimeout(() => setShowSkip(true), 800);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    if (useVideo !== false) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0;
    let H = 0;
    const fit = () => {
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
    };
    fit();
    window.addEventListener('resize', fit);

    const N = 600;
    const lemniscate = (cx: number, cy: number, a: number) => {
      const pts: [number, number][] = [];
      for (let i = 0; i <= N; i++) {
        const t = (i / N) * Math.PI * 2;
        const d = 1 + Math.sin(t) ** 2;
        pts.push([
          cx + (a * Math.SQRT2 * Math.cos(t)) / d,
          cy + (a * Math.SQRT2 * Math.sin(t) * Math.cos(t)) / d,
        ]);
      }
      return pts;
    };

    const particles: Particle[] = [];
    let burstFired = false;

    const drawFeather = (
      x: number,
      y: number,
      ang: number,
      s: number,
      alpha: number,
      glow: number,
    ) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang);
      ctx.scale(s, s);
      ctx.translate(0, -60); // tip sits on (x, y)
      ctx.globalAlpha = alpha;
      const g = ctx.createLinearGradient(-25, -62, 25, 60);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.5, '#c9c9d6');
      g.addColorStop(1, '#f0f0f5');
      ctx.shadowColor = 'rgba(235,235,245,0.9)';
      ctx.shadowBlur = glow;
      ctx.fillStyle = g;
      ctx.fill(FEATHER);
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(95,95,115,0.55)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(0, -56);
      ctx.lineTo(0, 58);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(120,120,140,0.35)';
      ctx.lineWidth = 0.8;
      for (const [sy, len] of [
        [-40, 14],
        [-24, 18],
        [-8, 19],
        [8, 16],
        [24, 12],
      ] as const) {
        ctx.beginPath();
        ctx.moveTo(0, sy);
        ctx.lineTo(-len, sy + 10);
        ctx.moveTo(0, sy);
        ctx.lineTo(len, sy + 10);
        ctx.stroke();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    };

    const strokePts = (pts: [number, number][], from: number, to: number) => {
      ctx.beginPath();
      ctx.moveTo(pts[from][0], pts[from][1]);
      for (let i = from + 1; i <= to; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.stroke();
    };

    const t0 = performance.now();
    let raf = 0;

    const render = (el: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#070308';
      ctx.fillRect(0, 0, W, H);

      const cx = W / 2;
      const cy = H * 0.46;
      const a = Math.min(W, H) * 0.19;
      const pts = lemniscate(cx, cy, a);
      const fscale = a / 95;

      // Camera: slow dolly push all along + extra kick on the pulse.
      const zoom =
        0.96 +
        0.05 * smooth(clamp01(el / CUE.end)) +
        0.05 * easeOut(clamp01((el - CUE.pulse) / 900));
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(zoom, zoom);
      ctx.translate(-cx, -cy);

      // --- Volumetric red fog -------------------------------------------------
      const fogIn = smooth(clamp01((el - CUE.fog) / 2500));
      if (fogIn > 0) {
        ctx.globalCompositeOperation = 'lighter';
        const blobs: [number, number, number][] = [
          [0.28 + 0.04 * Math.sin(el / 6800), 0.42 + 0.03 * Math.cos(el / 5400), 0.5],
          [0.72 + 0.05 * Math.cos(el / 7600), 0.5 + 0.04 * Math.sin(el / 6100), 0.55],
          [0.5 + 0.06 * Math.sin(el / 9000), 0.75, 0.6],
        ];
        for (const [bx, by, br] of blobs) {
          const r = br * Math.min(W, H);
          const g = ctx.createRadialGradient(bx * W, by * H, 0, bx * W, by * H, r);
          g.addColorStop(0, `rgba(130,14,30,${0.13 * fogIn})`);
          g.addColorStop(1, 'rgba(130,14,30,0)');
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, W, H);
        }
        ctx.globalCompositeOperation = 'source-over';
      }

      // --- Landing ripple -----------------------------------------------------
      const rip = clamp01((el - (CUE.write - 150)) / 800);
      if (rip > 0 && rip < 1) {
        ctx.strokeStyle = `rgba(230,230,245,${0.55 * (1 - rip)})`;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.ellipse(pts[0][0], pts[0][1], rip * 70, rip * 26, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      // --- The written infinity ----------------------------------------------
      const wp = smooth(clamp01((el - CUE.write) / (CUE.forge - CUE.write - 150)));
      const headIdx = Math.max(1, Math.floor(wp * N));
      const forged = el >= CUE.forge;
      if (wp > 0) {
        const metal = ctx.createLinearGradient(cx, cy - a, cx, cy + a);
        metal.addColorStop(0, '#ffffff');
        metal.addColorStop(0.5, '#b9b9c8');
        metal.addColorStop(1, '#eeeef4');
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        const pulseGlow = 1 - clamp01((el - CUE.pulse) / 1200);
        const bloom = el >= CUE.pulse ? 26 * pulseGlow : 0;
        ctx.strokeStyle = metal;
        ctx.lineWidth = forged ? 8 : 6;
        ctx.shadowColor = 'rgba(240,240,250,0.85)';
        ctx.shadowBlur = (forged ? 14 : 9) + bloom;
        strokePts(pts, 0, forged ? N : headIdx);
        ctx.shadowBlur = 0;

        if (!forged) {
          // Liquid glowing head while writing.
          const [hx, hy] = pts[headIdx];
          ctx.globalCompositeOperation = 'lighter';
          const hg = ctx.createRadialGradient(hx, hy, 0, hx, hy, 16);
          hg.addColorStop(0, 'rgba(255,255,255,0.95)');
          hg.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = hg;
          ctx.beginPath();
          ctx.arc(hx, hy, 16, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
        } else {
          // Forge flash, then a sheen travelling along the polished metal.
          const flash = 1 - clamp01((el - CUE.forge) / 900);
          if (flash > 0) {
            ctx.strokeStyle = `rgba(255,255,255,${flash})`;
            ctx.lineWidth = 8 + 10 * flash;
            ctx.shadowColor = '#ffffff';
            ctx.shadowBlur = 30 * flash;
            strokePts(pts, 0, N);
            ctx.shadowBlur = 0;
          }
          const s0 = Math.floor((el / 4) % N);
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = 'rgba(255,255,255,0.35)';
          ctx.lineWidth = 8;
          strokePts(pts, s0, Math.min(N, s0 + 36));
          ctx.globalCompositeOperation = 'source-over';
        }
      }

      // --- Crimson ornamental circle -------------------------------------------
      const cp = smooth(clamp01((el - CUE.circle) / 1700));
      if (cp > 0) {
        const R = a * 1.85;
        ctx.strokeStyle = 'rgba(190,35,55,0.95)';
        ctx.lineWidth = 2.4;
        ctx.shadowColor = 'rgba(220,45,70,0.8)';
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + cp * Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = `rgba(190,35,55,${0.4 * cp})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, R + 12, -Math.PI / 2, -Math.PI / 2 - cp * Math.PI * 2, true);
        ctx.stroke();
        ctx.shadowBlur = 0;
        const dp = clamp01((el - CUE.circle - 1300) / 700);
        if (dp > 0) {
          ctx.fillStyle = `rgba(215,55,80,${dp})`;
          for (let i = 0; i < 8; i++) {
            const ang = -Math.PI / 2 + (i * Math.PI) / 4;
            const dx = cx + Math.cos(ang) * R;
            const dy = cy + Math.sin(ang) * R;
            ctx.save();
            ctx.translate(dx, dy);
            ctx.rotate(ang + Math.PI / 4);
            const s = 4.5 * dp;
            ctx.fillRect(-s / 2, -s / 2, s, s);
            ctx.restore();
          }
        }
      }

      // --- Shockwaves + burst on the pulse -------------------------------------
      if (el >= CUE.pulse) {
        const k = clamp01((el - CUE.pulse) / 1300);
        for (const [delay, hue] of [
          [0, 'rgba(255,240,240,'],
          [120, 'rgba(220,50,70,'],
          [260, 'rgba(255,255,255,'],
        ] as const) {
          const kk = clamp01((el - CUE.pulse - delay) / 1100);
          if (kk > 0 && kk < 1) {
            ctx.strokeStyle = `${hue}${0.6 * (1 - kk)})`;
            ctx.lineWidth = 2.5 * (1 - kk) + 0.5;
            ctx.beginPath();
            ctx.arc(cx, cy, easeOut(kk) * Math.min(W, H) * 0.55, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
        if (!burstFired) {
          burstFired = true;
          for (let i = 0; i < 240; i++) {
            const ang = Math.random() * Math.PI * 2;
            const sp = 1.5 + Math.random() * 8;
            particles.push({
              x: cx,
              y: cy,
              vx: Math.cos(ang) * sp,
              vy: Math.sin(ang) * sp,
              r: 0.7 + Math.random() * 2.2,
              life: 0,
              max: 50 + Math.random() * 80,
              kind: 'burst',
              silver: Math.random() < 0.5,
            });
          }
        }
        void k;
      }

      // --- Feather ---------------------------------------------------------------
      if (el >= CUE.feather) {
        let fx = cx;
        let fy = -80;
        let fang = 0;
        let fa = 1;
        if (el < CUE.write) {
          const k = smooth(clamp01((el - CUE.feather) / (CUE.write - CUE.feather)));
          fx = lerp(cx, pts[0][0], k) + Math.sin(el / 320) * 16 * (1 - k);
          fy = lerp(-80, pts[0][1], k);
          fang = -0.4 * (1 - k) + Math.sin(el / 260) * 0.06 * (1 - k);
          fa = clamp01((el - CUE.feather) / 400);
        } else if (el < CUE.forge) {
          const wpF = smooth(clamp01((el - CUE.write) / (CUE.forge - CUE.write - 150)));
          const idx = Math.max(4, Math.floor(wpF * N));
          const [hx, hy] = pts[idx];
          const [px] = pts[idx - 4];
          fx = hx;
          fy = hy;
          fang = -0.28 + (hx - px) * 0.09 + Math.sin(el / 170) * 0.05;
          if (particles.length < 400 && Math.random() < 0.9) {
            particles.push({
              x: hx,
              y: hy,
              vx: (Math.random() - 0.5) * 1.6,
              vy: -Math.random() * 1.4 - 0.2,
              r: 0.5 + Math.random() * 1.3,
              life: 0,
              max: 20 + Math.random() * 22,
              kind: 'spark',
            });
          }
        } else if (el < CUE.align) {
          const k = smooth(clamp01((el - CUE.forge) / (CUE.align - CUE.forge)));
          fx = lerp(pts[N][0], cx, k);
          fy = lerp(pts[N][1], cy - a * 1.35, k);
          fang = Math.sin(k * Math.PI) * 0.5;
        } else {
          const k = smooth(clamp01((el - CUE.align) / 1500));
          fx = cx;
          fy = lerp(cy - a * 1.35, cy, k);
          fang = Math.sin((1 - k) * Math.PI) * 0.2;
        }
        const glow = el >= CUE.pulse ? 26 * (1 - clamp01((el - CUE.pulse) / 1200)) + 10 : 10;
        drawFeather(fx, fy, fang, fscale, fa, glow);
      }

      // --- Particles (embers, sparks, burst) --------------------------------------
      if (el > 500 && el < CUE.pulse && particles.length < 380 && Math.random() < 0.4) {
        particles.push({
          x: Math.random() * W,
          y: H + 12,
          vx: (Math.random() - 0.5) * 0.3,
          vy: -(0.25 + Math.random() * 0.55),
          r: 1 + Math.random() * 2.2,
          life: 0,
          max: 500 + Math.random() * 300,
          kind: 'ember',
        });
      }
      ctx.globalCompositeOperation = 'lighter';
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        if (p.kind === 'ember') p.vx += (Math.random() - 0.5) * 0.05;
        if (p.kind === 'burst') p.vy += 0.03;
        p.life++;
        if (p.life > p.max || p.y < -30) {
          particles.splice(i, 1);
          continue;
        }
        const fade = 1 - p.life / p.max;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        if (p.kind === 'ember') {
          ctx.shadowColor = 'rgba(255,90,50,0.9)';
          ctx.shadowBlur = 9;
          ctx.fillStyle = `rgba(255,${75 + Math.floor(90 * fade)},48,${0.5 * fade})`;
        } else {
          ctx.shadowColor = 'rgba(240,240,255,0.9)';
          ctx.shadowBlur = 7;
          ctx.fillStyle = p.silver
            ? `rgba(235,235,248,${0.85 * fade})`
            : `rgba(255,120,90,${0.8 * fade})`;
        }
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.restore();

      // --- Screen-space: heartbeat, flash, vignette, fade-out ---------------------
      const hb = clamp01((el - (CUE.pulse - 600)) / 450);
      if (hb > 0 && el < CUE.pulse) {
        ctx.fillStyle = `rgba(0,0,0,${0.3 * Math.sin(hb * Math.PI)})`;
        ctx.fillRect(0, 0, W, H);
      }
      const fk = clamp01((el - CUE.pulse) / 1300);
      if (fk > 0 && fk < 1) {
        const g = ctx.createRadialGradient(W / 2, H * 0.46, 0, W / 2, H * 0.46, Math.max(W, H) * 0.7);
        g.addColorStop(0, `rgba(255,240,240,${0.85 * (1 - fk)})`);
        g.addColorStop(0.35, `rgba(210,40,60,${0.3 * (1 - fk)})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }
      const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.6)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);
      const out = clamp01((el - (CUE.end - 500)) / 500);
      if (out > 0) {
        ctx.fillStyle = `rgba(5,2,4,${out})`;
        ctx.fillRect(0, 0, W, H);
      }
    };

    const loop = (now: number) => {
      const el = now - t0;
      render(el);
      if (el >= CUE.end + 80) {
        finish();
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', fit);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useVideo]);

  return (
    <div className="intro">
      {useVideo !== false ? (
        <video
          className="intro-video"
          src="/intro.mp4"
          autoPlay
          muted
          playsInline
          onCanPlay={() => setUseVideo(true)}
          onError={() => setUseVideo(false)}
          onEnded={finish}
        />
      ) : (
        <canvas ref={canvasRef} className="intro-canvas" />
      )}
      {showSkip && (
        <button className="intro-skip" onClick={finish}>
          Skip intro ›
        </button>
      )}
    </div>
  );
}
