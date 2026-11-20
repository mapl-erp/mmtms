export function Plate({ children }: { children: React.ReactNode }) {
  return (
    <span className="plate">
      <i>IND</i>
      {children}
    </span>
  );
}

export function Pill({
  tone,
  children,
}: {
  tone?: "ok" | "warn" | "bad" | "info";
  children: React.ReactNode;
}) {
  return <span className={`pill ${tone ?? ""}`}>{children}</span>;
}

export function Flash({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="flash">{message}</p>;
}
