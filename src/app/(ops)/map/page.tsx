import { MapView } from "@/components/MapView";

export const metadata = { title: "Live map" };

export default function MapPage() {
  return (
    <>
      <p className="kicker">Live map</p>
      <h1>Both trucks, moving</h1>
      <p className="lede">
        MH14MM3501 runs the Mumbai–Pune corridor. MH14MM3502 runs Pune–Nashik. Positions come from the GPS simulator, refreshed every few seconds. Displayed speed is a road speed, not the animation rate.
      </p>
      <div className="section">
        <MapView />
      </div>
    </>
  );
}
