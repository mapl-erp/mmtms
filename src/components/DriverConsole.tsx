"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Proof = { kind: string; capture: string };

type Trip = {
  id: string;
  number: string;
  status: string;
  origin: string;
  destination: string;
  goods: string;
  truck: string;
  sealNumber: string | null;
  podOtpOk: boolean;
  devOtp: string | null;
  proofs: Proof[];
};

const DB = "mm-driver";
const STORE = "outbox";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function enqueue(payload: Record<string, unknown>) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ id: crypto.randomUUID(), payload, createdAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function queuedItems(): Promise<{ id: string; payload: Record<string, unknown> }[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result as { id: string; payload: Record<string, unknown> }[]);
    request.onerror = () => reject(request.error);
  });
}

async function dropItem(id: string) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function stampStill(kind: string): string {
  const canvas = document.createElement("canvas");
  canvas.width = 960;
  canvas.height = 600;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = "#1b3a34";
  ctx.fillRect(0, 0, 960, 600);
  ctx.fillStyle = "#f6efe4";
  ctx.fillRect(28, 28, 904, 544);
  ctx.fillStyle = "#e7a23a";
  ctx.fillRect(28, 28, 904, 74);
  ctx.fillStyle = "#1c1612";
  ctx.font = "32px Georgia, serif";
  ctx.fillText("Mighty Movers proof", 56, 76);
  ctx.font = "48px Georgia, serif";
  ctx.fillText(kind.replaceAll("_", " "), 56, 230);
  ctx.font = "22px sans-serif";
  ctx.fillStyle = "#5c5348";
  ctx.fillText("Stamped still — this browser has no camera", 56, 290);
  ctx.fillText(new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }), 56, 330);
  return canvas.toDataURL("image/jpeg", 0.86);
}

export function DriverConsole({ trip, driverName }: { trip: Trip | null; driverName: string }) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const sigRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [noCamera, setNoCamera] = useState(false);
  const [message, setMessage] = useState("");
  const [queued, setQueued] = useState(0);
  const [worker, setWorker] = useState("not registered");
  const [seal, setSeal] = useState(trip?.sealNumber ?? "");
  const [otp, setOtp] = useState("");

  async function refreshQueue() {
    const items = await queuedItems();
    setQueued(items.length);
  }

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then(() => setWorker("registered"))
        .catch(() => setWorker("unavailable"));
    }
    void refreshQueue();
    const onOnline = () => void flush();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
    // flush on reconnect only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function flush() {
    const items = await queuedItems();
    for (const item of items) {
      try {
        const response = await fetch("/api/driver/proof", {
          method: "POST",
          headers: { "content-type": "application/json", "x-mm-queue": "flush" },
          body: JSON.stringify(item.payload),
        });
        if (response.ok && response.status !== 202) await dropItem(item.id);
        else break;
      } catch {
        break;
      }
    }
    await refreshQueue();
    router.refresh();
  }

  async function postProof(kind: string, dataUrl: string, capture: "camera" | "stamped_still") {
    if (!trip) return;
    let lat: number | null = null;
    let lng: number | null = null;
    if (navigator.geolocation) {
      await new Promise<void>((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            lat = pos.coords.latitude;
            lng = pos.coords.longitude;
            resolve();
          },
          () => resolve(),
          { timeout: 2000 },
        );
      });
    }
    const payload = { tripId: trip.id, kind, dataUrl, capture, lat, lng };
    const send = async () => {
      const response = await fetch("/api/driver/proof", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (response.status === 202) return "queued" as const;
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not save the proof");
      }
      return "saved" as const;
    };
    try {
      if (!navigator.onLine) {
        await enqueue(payload);
        setMessage(`${kind.replaceAll("_", " ")} queued offline`);
      } else {
        const result = await send();
        setMessage(result === "queued" ? "Queued by the service worker" : "Saved on the trip");
        if (result === "saved") router.refresh();
      }
    } catch {
      await enqueue(payload);
      setMessage("Network failed. The proof is in the offline queue.");
    }
    await refreshQueue();
  }

  async function openCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOn(true);
      setNoCamera(false);
    } catch {
      setNoCamera(true);
      setCameraOn(false);
    }
  }

  async function shutter(kind: string) {
    const video = videoRef.current;
    if (!video || !cameraOn) {
      await postProof(kind, stampStill(kind), "stamped_still");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 960;
    canvas.height = video.videoHeight || 600;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    await postProof(kind, canvas.toDataURL("image/jpeg", 0.86), "camera");
  }

  function pointer(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = sigRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((event.clientY - rect.top) / rect.height) * canvas.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (event.type === "pointerdown") {
      drawing.current = true;
      ctx.beginPath();
      ctx.moveTo(x, y);
    } else if (event.type === "pointermove" && drawing.current) {
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.strokeStyle = "#1c1612";
      ctx.lineTo(x, y);
      ctx.stroke();
    } else {
      drawing.current = false;
    }
  }

  async function saveSeal(event: React.FormEvent) {
    event.preventDefault();
    if (!trip) return;
    const response = await fetch("/api/driver/seal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tripId: trip.id, seal }),
    });
    const body = (await response.json()) as { error?: string };
    setMessage(response.ok ? "Seal saved" : body.error ?? "Could not save the seal");
    if (response.ok) router.refresh();
  }

  async function saveOtp(event: React.FormEvent) {
    event.preventDefault();
    if (!trip) return;
    const response = await fetch("/api/driver/otp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tripId: trip.id, otp }),
    });
    const body = (await response.json()) as { error?: string };
    setMessage(response.ok ? "Consignee OTP matched" : body.error ?? "OTP failed");
    if (response.ok) router.refresh();
  }

  return (
    <div className="phone">
      <header>
        <p className="kicker">Driver phone</p>
        <h1 style={{ fontSize: 32 }}>{driverName}</h1>
        <p>
          {worker === "registered" ? "Service worker on" : "Service worker starting"} · offline queue {queued}
        </p>
      </header>
      <div className="body">
        {!trip ? (
          <p>No open duty on this phone.</p>
        ) : (
          <>
            <section className="capture">
              <strong className="mono">{trip.number}</strong>
              <span>
                {trip.origin} <span className="arrow">→</span> {trip.destination}
              </span>
              <span className="muted">
                {trip.truck} · {trip.goods} · {trip.status.replaceAll("_", " ").toLowerCase()}
              </span>
            </section>
            {trip.devOtp && !trip.podOtpOk ? (
              <div className="otp-banner">
                Development consignee OTP (no SMS is sent): <strong className="mono">{trip.devOtp}</strong>
              </div>
            ) : null}
            {message ? <p className="flash">{message}</p> : null}
            <form className="capture" onSubmit={saveSeal}>
              <label>
                Seal number
                <input value={seal} onChange={(event) => setSeal(event.target.value)} placeholder="SL-4418" />
              </label>
              <button className="btn" type="submit">
                Save seal
              </button>
            </form>
            <section className="capture">
              <strong>Camera proofs</strong>
              <video ref={videoRef} className="video-box" playsInline muted />
              <button className="btn secondary" type="button" onClick={() => void openCamera()}>
                Open camera
              </button>
              {noCamera ? <p className="muted">No camera on this browser. A still will be stamped and labelled.</p> : null}
              <button className="btn" type="button" onClick={() => void shutter("LOAD_PHOTO")}>
                Load photo
              </button>
              <button className="btn" type="button" onClick={() => void shutter("WEIGHBRIDGE_LOAD")}>
                Weighbridge slip
              </button>
              <button className="btn secondary" type="button" onClick={() => void shutter("SEAL_PHOTO")}>
                Seal photo
              </button>
            </section>
            <section className="capture">
              <strong>Already on this trip</strong>
              {trip.proofs.length === 0 ? <p className="muted">Nothing filed yet.</p> : null}
              {trip.proofs.map((proof, index) => (
                <p key={`${proof.kind}-${index}`}>
                  {proof.kind.replaceAll("_", " ")} · {proof.capture === "stamped_still" ? "stamped still" : "camera"}
                </p>
              ))}
            </section>
            <form className="capture" onSubmit={saveOtp}>
              <label>
                Consignee OTP
                <input inputMode="numeric" value={otp} onChange={(event) => setOtp(event.target.value)} placeholder="6 digits" />
              </label>
              <button className="btn" type="submit">
                Match OTP
              </button>
            </form>
            <section className="capture">
              <strong>Consignee signature</strong>
              <canvas
                ref={sigRef}
                className="sig"
                width={640}
                height={240}
                onPointerDown={pointer}
                onPointerMove={pointer}
                onPointerUp={pointer}
                onPointerLeave={pointer}
              />
              <button
                className="btn"
                type="button"
                onClick={() => {
                  const canvas = sigRef.current;
                  if (!canvas) return;
                  void postProof("SIGNATURE", canvas.toDataURL("image/jpeg", 0.86), "camera");
                }}
              >
                Save signature
              </button>
            </section>
            {queued > 0 ? (
              <button className="btn secondary" type="button" onClick={() => void flush()}>
                Send queued proofs
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
