import { useEffect, useRef } from 'react';
import { useTheme } from '@/hooks/useTheme';

interface Star {
  x: number;
  y: number;
  size: number;
  opacity: number;
  speed: number;
}

interface Building {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

interface Car {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  speed: number;
}

/**
 * 8-bit night city scene for dark theme.
 * Renders pixelated buildings, stars, and cars for a retro city vibe.
 */
export function NightCityBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { theme } = useTheme();

  useEffect(() => {
    if (theme !== 'dark') return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;

    const W = 200;
    const H = 200;
    canvas.width = W;
    canvas.height = H;

    const stars: Star[] = [];
    for (let i = 0; i < 50; i++) {
      stars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        size: Math.random() * 1.5,
        opacity: Math.random() * 0.8 + 0.2,
        speed: Math.random() * 0.02,
      });
    }

    const buildings: Building[] = [];
    const numBuildings = 8;
    const buildingWidth = W / numBuildings;
    for (let i = 0; i < numBuildings; i++) {
      const height = Math.random() * 60 + 40;
      buildings.push({
        x: i * buildingWidth,
        y: H - height,
        width: buildingWidth - 2,
        height,
        color: `hsl(${Math.random() * 60}, 80%, ${Math.random() * 30 + 20}%)`,
      });
    }

    const cars: Car[] = [];
    const roadY = H * 0.7;
    const roadWidth = buildingWidth * numBuildings;
    for (let i = 0; i < 3; i++) {
      cars.push({
        x: Math.random() * (roadWidth - 40),
        y: roadY - 10,
        width: 20,
        height: 8,
        color: Math.random() > 0.5 ? '#ff6' : '#fff',
        speed: Math.random() * 0.5 + 0.5,
      });
    }

    let raf: number;
    let time = 0;

    function draw() {
      ctx.clearRect(0, 0, W, H);
      time += 0.05;

      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);

      for (const star of stars) {
        star.y += star.speed;
        if (star.y > H) {
          star.y = -5;
          star.x = Math.random() * W;
        }
        ctx.fillStyle = `rgba(255, 255, 255, ${star.opacity})`;
        ctx.fillRect(star.x, star.y, star.size, star.size);
      }

      for (const building of buildings) {
        ctx.fillStyle = building.color;
        ctx.fillRect(building.x, building.y, building.width, building.height);

        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        for (let i = 0; i < 3; i++) {
          const winX = building.x + 3 + i * 15;
          const winY = building.y + 5;
          ctx.fillRect(winX, winY, 4, 4);
        }
      }

      for (const car of cars) {
        car.x += car.speed;
        if (car.x > W) {
          car.x = -car.width;
        }
        ctx.fillStyle = car.color;
        ctx.fillRect(car.x, car.y, car.width, car.height);

        ctx.fillStyle = '#000';
        ctx.fillRect(car.x, car.y + 2, car.width, 4);
      }

      const neonColor = '#0f0';
      ctx.strokeStyle = neonColor;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(0, H * 0.6);
      ctx.lineTo(W, H * 0.6);
      ctx.stroke();

      ctx.setLineDash([]);
      raf = requestAnimationFrame(draw);
    }

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [theme]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[1] h-full w-full"
      style={{ imageRendering: 'pixelated' }}
    />
  );
}