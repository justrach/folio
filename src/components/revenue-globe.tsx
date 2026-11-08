"use client";

import { useEffect, useRef } from "react";
import type { RevenueSummary } from "@/lib/stripe-revenue";
import "./revenue-globe.css";

/** Great-circle-ish interpolation between two lat/lon points, in degrees. */
function arcPoints(from: [number, number], to: [number, number], steps = 24) {
  const points: [number, number][] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    // Interpolate in 3D so longitudes wrap the short way round, then project back.
    const a = toVector(from), b = toVector(to);
    const dot = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
    const omega = Math.acos(dot);
    const sin = Math.sin(omega) || 1;
    const wa = Math.sin((1 - t) * omega) / sin;
    const wb = Math.sin(t * omega) / sin;
    const v: [number, number, number] = [a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb, a[2] * wa + b[2] * wb];
    points.push([(Math.asin(v[2]) * 180) / Math.PI, (Math.atan2(v[1], v[0]) * 180) / Math.PI]);
  }
  return points;
}

function toVector([lat, lon]: [number, number]): [number, number, number] {
  const phi = (lat * Math.PI) / 180;
  const theta = (lon * Math.PI) / 180;
  return [Math.cos(phi) * Math.cos(theta), Math.cos(phi) * Math.sin(theta), Math.sin(phi)];
}

/** Revenue by country, drawn as arcs onto a rotating dot globe. */
export function RevenueGlobe({ summary }: { summary: RevenueSummary }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const hub: [number, number] = [1.35, 103.8]; // Singapore: where the index runs
    let rotation = -20;
    let frame = 0;
    let width = 0;
    let height = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      width = rect.width; height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const project = (lat: number, lon: number, radius: number) => {
      const phi = (lat * Math.PI) / 180;
      const theta = ((lon + rotation) * Math.PI) / 180;
      const x = Math.cos(phi) * Math.sin(theta);
      const y = Math.cos(phi) * Math.cos(theta);
      const z = Math.sin(phi);
      return { x: width / 2 + x * radius, y: height / 2 - z * radius, depth: y };
    };

    const draw = () => {
      context.clearRect(0, 0, width, height);
      const radius = Math.min(width, height) * 0.42;

      // dot grid on the sphere
      for (let lat = -75; lat <= 75; lat += 15) {
        for (let lon = -180; lon < 180; lon += 15) {
          const point = project(lat, lon, radius);
          if (point.depth < -0.15) continue;
          const alpha = 0.08 + Math.max(0, point.depth) * 0.22;
          context.fillStyle = `rgba(23,23,23,${alpha.toFixed(3)})`;
          context.beginPath();
          context.arc(point.x, point.y, 1.1, 0, Math.PI * 2);
          context.fill();
        }
      }

      // equator + prime meridian give the sphere a readable orientation
      context.strokeStyle = "rgba(23,23,23,0.14)";
      context.lineWidth = 1;
      for (const lat of [-45, 0, 45]) {
        context.beginPath();
        for (let lon = -180; lon <= 180; lon += 4) {
          const point = project(lat, lon, radius);
          if (point.depth < -0.2) continue;
          context.lineTo(point.x, point.y);
        }
        context.stroke();
      }

      const max = Math.max(...summary.places.map(place => place.amountUsd), 1);
      for (const place of summary.places) {
        const points = arcPoints(hub, [place.lat, place.lon]);
        const weight = 0.6 + (place.amountUsd / max) * 2.4;
        context.strokeStyle = `rgba(216,63,0,${(0.25 + (place.amountUsd / max) * 0.55).toFixed(2)})`;
        context.lineWidth = weight;
        context.beginPath();
        let started = false;
        for (const [lat, lon] of points) {
          const point = project(lat, lon, radius);
          const lift = 1 + Math.sin(((lon - hub[1]) * Math.PI) / 360) * 0.12;
          const x = width / 2 + (point.x - width / 2) * lift;
          const y = height / 2 + (point.y - height / 2) * lift;
          if (point.depth < -0.35) { started = false; continue; }
          if (!started) { context.moveTo(x, y); started = true; } else context.lineTo(x, y);
        }
        context.stroke();

        const target = project(place.lat, place.lon, radius);
        if (target.depth > -0.2) {
          context.fillStyle = "#d83f00";
          context.beginPath();
          context.arc(target.x, target.y, 2.6, 0, Math.PI * 2);
          context.fill();
          context.fillStyle = "rgba(23,23,23,0.72)";
          context.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
          context.fillText(place.country, target.x + 6, target.y - 4);
        }
      }

      // hub marker
      const origin = project(hub[0], hub[1], radius);
      context.fillStyle = "#171717";
      context.beginPath();
      context.arc(origin.x, origin.y, 3.4, 0, Math.PI * 2);
      context.fill();

      if (!reduce) rotation += 0.12;
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);

    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [summary]);

  const top = summary.places.slice(0, 4);

  return (
    <section className="revenue-globe" aria-label="Revenue by country">
      <header>
        <div>
          <h2>Revenue by country</h2>
          <p>{summary.status === "connected" ? summary.note : "Sample geography until Stripe is connected."}</p>
        </div>
        <span className={`revenue-badge ${summary.status}`}>{summary.status === "connected" ? "Measured" : "Sample"}</span>
      </header>

      <div className="revenue-body">
        <canvas ref={canvasRef} className="revenue-canvas" role="img"
          aria-label={`Revenue of $${summary.totalUsd.toLocaleString()} across ${summary.places.length} countries`} />
        <div className="revenue-legend">
          <div className="revenue-total">
            <span>Last {summary.windowDays} days</span>
            <strong>${summary.totalUsd.toLocaleString()}</strong>
          </div>
          <ul>
            {top.map(place => (
              <li key={place.country}>
                <span className="revenue-country">{place.label}</span>
                <span className="revenue-amount">${place.amountUsd.toLocaleString()}</span>
              </li>
            ))}
          </ul>
          <p className="revenue-note">{summary.note}</p>
        </div>
      </div>
    </section>
  );
}
