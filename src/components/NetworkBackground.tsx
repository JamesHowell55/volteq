import { useEffect, useRef } from 'react';

// A decorative, full-page reactive node network — sparse, minimalistic (this
// is texture, not a focal point), reacting gently to cursor proximity. Built
// from scratch with plain canvas + rAF (no particle library) to match this
// project's minimal-dependency ethos.
//
// Idle drift and the mouse reaction are deliberately two independent,
// additive systems rather than one: `base` continuously drifts and bounces
// off the canvas edges (the "alive" idle motion, always running), while
// `offset` is a mass-spring-damper displacement layered on top, pushed by
// cursor proximity and always relaxing back toward (0,0) — never toward a
// frozen original point, which would fight the drift. Rendered position is
// always base + offset.

const AREA_PER_NODE = 18000; // px^2 per node
const MIN_NODES = 32;
const MAX_NODES = 160;
const CONNECT_DIST = 150; // px
const MAX_LINE_OPACITY = 0.32;
const NODE_OPACITY = 0.85;
const NODE_RADIUS = 2;
const NODE_GLOW = 6; // soft radial glow per node, canvas shadowBlur px
const DRIFT_SPEED = 0.12; // px/frame @60fps baseline, per axis
const REPEL_RADIUS = 140;
const REPEL_STRENGTH = 2.2;
const SPRING_K = 0.02;
const SPRING_DAMPING = 0.86;
const MAX_OFFSET = 46;
const RESIZE_DEBOUNCE_MS = 150;
const DPR_CAP = 2;
const ACCENT_POLL_MS = 1000;

interface Node {
  baseX: number;
  baseY: number;
  vx: number;
  vy: number;
  offsetX: number;
  offsetY: number;
  offsetVX: number;
  offsetVY: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

function nodeCountFor(w: number, h: number): number {
  return clamp(Math.round((w * h) / AREA_PER_NODE), MIN_NODES, MAX_NODES);
}

function makeNode(w: number, h: number): Node {
  const angle = Math.random() * Math.PI * 2;
  return {
    baseX: Math.random() * w,
    baseY: Math.random() * h,
    vx: Math.cos(angle) * DRIFT_SPEED * (0.3 + Math.random() * 0.7),
    vy: Math.sin(angle) * DRIFT_SPEED * (0.3 + Math.random() * 0.7),
    offsetX: 0, offsetY: 0, offsetVX: 0, offsetVY: 0,
  };
}

// Parses a "#rrggbb" (or "#rgb") string into an rgba() string at the given alpha.
// Falls back to the Volteq teal if the computed style read ever comes back empty.
function hexToRgba(hex: string, alpha: number): string {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const num = parseInt(h, 16);
  if (h.length !== 6 || isNaN(num)) return `rgba(93, 202, 165, ${alpha})`;
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function NetworkBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = window.innerWidth;
    let height = window.innerHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    let nodes: Node[] = [];
    let mouseX = -9999;
    let mouseY = -9999;
    let accent = '#5DCAA5';
    let rafId = 0;
    let running = false;
    let lastTs = 0;
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;

    const reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const coarsePointerQuery = window.matchMedia('(pointer: coarse)');

    function readAccent() {
      const v = getComputedStyle(document.documentElement).getPropertyValue('--accent-on-dark').trim();
      if (v) accent = v;
    }

    function sizeCanvas() {
      const newW = window.innerWidth;
      const newH = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
      canvas!.width = Math.round(newW * dpr);
      canvas!.height = Math.round(newH * dpr);
      canvas!.style.width = `${newW}px`;
      canvas!.style.height = `${newH}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (nodes.length && width > 0 && height > 0) {
        const sx = newW / width;
        const sy = newH / height;
        for (const n of nodes) { n.baseX *= sx; n.baseY *= sy; }
      }
      width = newW;
      height = newH;

      const target = nodeCountFor(width, height);
      while (nodes.length < target) nodes.push(makeNode(width, height));
      if (nodes.length > target) nodes.length = target;
    }

    function drawStatic() {
      ctx!.clearRect(0, 0, width, height);
      drawConnections();
      drawNodes();
    }

    function drawConnections() {
      ctx!.lineWidth = 1;
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        const ax = a.baseX + a.offsetX;
        const ay = a.baseY + a.offsetY;
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const bx = b.baseX + b.offsetX;
          const by = b.baseY + b.offsetY;
          const dist = Math.hypot(ax - bx, ay - by);
          if (dist < CONNECT_DIST) {
            ctx!.strokeStyle = hexToRgba(accent, (1 - dist / CONNECT_DIST) * MAX_LINE_OPACITY);
            ctx!.beginPath();
            ctx!.moveTo(ax, ay);
            ctx!.lineTo(bx, by);
            ctx!.stroke();
          }
        }
      }
    }

    function drawNodes() {
      ctx!.fillStyle = hexToRgba(accent, NODE_OPACITY);
      ctx!.shadowColor = hexToRgba(accent, 0.9);
      ctx!.shadowBlur = NODE_GLOW;
      for (const n of nodes) {
        ctx!.beginPath();
        ctx!.arc(n.baseX + n.offsetX, n.baseY + n.offsetY, NODE_RADIUS, 0, Math.PI * 2);
        ctx!.fill();
      }
      ctx!.shadowBlur = 0;
    }

    function step(ts: number) {
      if (!running) return;
      const dt = lastTs ? Math.min((ts - lastTs) / (1000 / 60), 3) : 1;
      lastTs = ts;
      const skipRepel = coarsePointerQuery.matches;

      for (const n of nodes) {
        n.baseX += n.vx * dt;
        n.baseY += n.vy * dt;
        if (n.baseX < 0 || n.baseX > width) { n.vx *= -1; n.baseX = clamp(n.baseX, 0, width); }
        if (n.baseY < 0 || n.baseY > height) { n.vy *= -1; n.baseY = clamp(n.baseY, 0, height); }

        if (!skipRepel) {
          const cx = n.baseX + n.offsetX;
          const cy = n.baseY + n.offsetY;
          const dx = cx - mouseX;
          const dy = cy - mouseY;
          const dist = Math.hypot(dx, dy);
          if (dist < REPEL_RADIUS && dist > 0.01) {
            const force = (1 - dist / REPEL_RADIUS) ** 2 * REPEL_STRENGTH;
            n.offsetVX += (dx / dist) * force;
            n.offsetVY += (dy / dist) * force;
          }
        }

        n.offsetVX += -SPRING_K * n.offsetX;
        n.offsetVY += -SPRING_K * n.offsetY;
        n.offsetVX *= SPRING_DAMPING;
        n.offsetVY *= SPRING_DAMPING;
        n.offsetX += n.offsetVX * dt;
        n.offsetY += n.offsetVY * dt;

        const mag = Math.hypot(n.offsetX, n.offsetY);
        if (mag > MAX_OFFSET) {
          const k = MAX_OFFSET / mag;
          n.offsetX *= k;
          n.offsetY *= k;
        }
      }

      ctx!.clearRect(0, 0, width, height);
      drawConnections();
      drawNodes();
      rafId = requestAnimationFrame(step);
    }

    function start() {
      if (running || reduceMotionQuery.matches) return;
      running = true;
      lastTs = 0;
      rafId = requestAnimationFrame(step);
    }

    function stop() {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
    }

    function handleMouseMove(e: MouseEvent) {
      mouseX = e.clientX;
      mouseY = e.clientY;
    }
    function handleMouseOut() {
      mouseX = -9999;
      mouseY = -9999;
    }
    function handleResize() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        sizeCanvas();
        if (reduceMotionQuery.matches) drawStatic();
      }, RESIZE_DEBOUNCE_MS);
    }
    function handleVisibilityChange() {
      if (document.hidden) stop();
      else start();
    }
    function handleReduceMotionChange() {
      if (reduceMotionQuery.matches) {
        stop();
        drawStatic();
      } else {
        start();
      }
    }

    readAccent();
    sizeCanvas();
    const accentInterval = setInterval(readAccent, ACCENT_POLL_MS);

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mouseout', handleMouseOut, { passive: true });
    window.addEventListener('resize', handleResize);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    reduceMotionQuery.addEventListener('change', handleReduceMotionChange);

    if (reduceMotionQuery.matches) {
      drawStatic();
    } else {
      start();
    }

    return () => {
      stop();
      clearInterval(accentInterval);
      clearTimeout(resizeTimer);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseout', handleMouseOut);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      reduceMotionQuery.removeEventListener('change', handleReduceMotionChange);
    };
  }, []);

  return (
    <div className="network-bg" aria-hidden="true">
      <canvas ref={canvasRef} />
    </div>
  );
}
