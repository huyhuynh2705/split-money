import { useState } from "react";
import type { AppData } from "./types";
import WelcomeScreen from "./components/WelcomeScreen";
import Dashboard from "./components/Dashboard";

export default function App() {
  const [data, setData] = useState<AppData | null>(null);

  if (!data) {
    return <WelcomeScreen onStart={setData} />;
  }
  return (
    <Dashboard
      data={data}
      setData={setData}
      onReset={() => setData(null)}
    />
  );
}
