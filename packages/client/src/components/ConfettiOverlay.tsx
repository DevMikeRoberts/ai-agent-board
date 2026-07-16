import { useEffect, useRef } from 'react';

interface ConfettiPiece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  rotation: number;
  rotationSpeed: number;
  size: number;
}

/**
 * 8-bit confetti burst effect for task completion.
 * Renders pixelated confetti particles that drift down.
 */
export function ConfettiOverlay({ x, y }: { x: number; y: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<ConfettiPiece[]>([]);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = 320;
    const H = 240;
    canvas.width = W;
    canvas.height = H;

    const colors = ['#ff0', '#0f0', '#0ff', '#f00', '#f0f', '#00f'];

    const createParticles = () => {
      particlesRef.current = [];
      for (let i = 0; i < 50; i++) {
        const angle = (Math.random() - 0.5) * Math.PI * 1.5;
        const speed = Math.random() * 3 + 2;
        particlesRef.current.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - Math.random() * 1.5,
          color: colors[Math.floor(Math.random() * colors.length)],
          rotation: Math.random() * 360,
          rotationSpeed: (Math.random() - 0.5) * 0.1,
          size: Math.random() * 2 + 1,
        });
      }
    };

    createParticles();

    const animate = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, W, H);

      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.fillText('✓', x, y);

      const particles = particlesRef.current;
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.05;
        p.rotation += p.rotationSpeed;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size/2, -p.size/2, p.size, p.size);
        ctx.restore();

        if (p.y > H || p.x < -20 || p.x > W + 20) {
          particles.splice(i, 1);
        }
      }

      if (particles.length > 0) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        animationRef.current = null;
      }
    };

    animate();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [x, y]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-[100]"
      style={{ imageRendering: 'pixelated' }}
    />
  );
}