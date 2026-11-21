"use client";

import { useEffect, useState } from "react";
import { project, type Point } from "@/lib/gps";

type Position = {
  regNo: string;
  make: string;
  model: string;
  status: string;
  lat: number;
  lng: number;
  speedKmh: number;
  heading: number;
  route: Point[];
};

type City = { name: string; lat: number; lng: number };

export function MapView() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [at, setAt] = useState<string>("");

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      const response = await fetch("/api/gps", { cache: "no-store" });
      if (!response.ok || stop) return;
      const body = (await response.json()) as { positions: Position[]; cities: City[]; at: string };
      setPositions(body.positions);
      setCities(body.cities);
      setAt(body.at);
    };
    void tick();
    const timer = setInterval(() => void tick(), 3000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <div className="map-wrap">
      <div className="between" style={{ padding: "6px 10px 10px" }}>
        <strong>GPS simulator</strong>
        <span className="mono">{at ? new Date(at).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" }) : "…"}</span>
      </div>
      <svg viewBox="0 0 920 570" role="img" aria-label="Live truck positions">
        <rect x="0" y="0" width="920" height="570" rx="16" fill="#10241f" />
        {positions.map((truck) => {
          const d = truck.route.map((point, index) => {
            const p = project(point.lat, point.lng);
            return `${index === 0 ? "M" : "L"} ${p.x} ${p.y}`;
          }).join(" ");
          return <path key={truck.regNo} d={d} fill="none" stroke="#315e54" strokeWidth="4" />;
        })}
        {cities.map((city) => {
          const p = project(city.lat, city.lng);
          return (
            <g key={city.name}>
              <circle cx={p.x} cy={p.y} r="4" fill="#e7a23a" />
              <text x={p.x + 8} y={p.y - 8} fill="#f6efe4" fontSize="14">
                {city.name}
              </text>
            </g>
          );
        })}
        {positions.map((truck, index) => {
          const p = project(truck.lat, truck.lng);
          return (
            <g key={truck.regNo} transform={`translate(${p.x} ${p.y})`}>
              <circle r="16" fill={index === 0 ? "#e0702f" : "#f0c419"} stroke="#fffaf3" strokeWidth="2" />
              <text y="36" textAnchor="middle" fill="#fffaf3" fontSize="13" fontFamily="ui-monospace, monospace">
                {truck.regNo}
              </text>
              <text y="52" textAnchor="middle" fill="#d7c4a4" fontSize="12">
                {truck.speedKmh} km/h
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
