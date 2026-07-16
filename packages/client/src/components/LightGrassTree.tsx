import { useEffect, useRef } from 'react';

interface GrassBlade {
  x: number;
  y: number;
  height: number;
  color: string;
}

interface TreeLeaf {
  x: number;
  y: number;
  size: number;
  color: string;
}

/**
 * 8-bit grass and tree art for light theme.
 * Renders pixelated grass blades and tree leaves.
 */
export function LightGrassTree() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;

    const W = 200;
    const H = 200;
    canvas.width = W;
    canvas.height = H;

    const groundY = H * 0.8;
    const grassBlades: GrassBlade[] = [];
    for (let i = 0; i < 80; i++) {
      grassBlades.push({
        x: i * 2.5,
        y: groundY,
        height: Math.random() * 20 + 10,
        color: '#22c55e',
      });
    }

    const treeLeaves: TreeLeaf[] = [];
    const treePositions = [
      { x: 30, y: groundY - 40 },
      { x: 70, y: groundY - 50 },
      { x: 110, y: groundY - 35 },
      { x: 150, y: groundY - 45 },
    ];
    for (const pos of treePositions) {
      for (let i = 0; i < 20; i++) {
        const angle = (Math.random() - 0.5) * Math.PI;
        const radius = Math.random() * 15;
        treeLeaves.push({
          x: pos.x + Math.cos(angle) * radius,
          y: pos.y + Math.sin(angle) * radius,
          size: Math.random() * 2 + 1,
          color: '#16a34a',
        });
      }
    }

    let raf: number;
    let time = 0;

    function draw() {
      ctx.clearRect(0, 0, W, H);
      time += 0.05;

      ctx.fillStyle = '#fef9c3';
      ctx.fillRect(0, 0, W, H);

      ctx.fillStyle = '#22c55e';
      for (const blade of grassBlades) {
        ctx.fillRect(blade.x, blade.y - blade.height, 1, blade.height);
      }

      for (const leaf of treeLeaves) {
        ctx.fillStyle = leaf.color;
        ctx.fillRect(leaf.x, leaf.y, leaf.size, leaf.size);
      }

      ctx.fillStyle = '#a16207';
      ctx.fillRect(20, groundY - 20, 4, 20);

      raf = requestAnimationFrame(draw);
    }

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[1] h-full w-full"
      style={{ imageRendering: 'pixelated' }}
    />
  );
}