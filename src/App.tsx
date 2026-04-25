import { useEffect, useState } from "react";
import type { AppData } from "./types";
import WelcomeScreen from "./components/WelcomeScreen";
import Dashboard from "./components/Dashboard";
import {
  clearAppDataCache,
  loadCachedAppData,
  saveAppDataToCache,
} from "./utils/storage";

export default function App() {
  const [data, setData] = useState<AppData | null>(() => loadCachedAppData());

  useEffect(() => {
    if (data) saveAppDataToCache(data);
  }, [data]);

  const reset = () => {
    clearAppDataCache();
    setData(null);
  };

  if (!data) {
    return <WelcomeScreen onStart={setData} />;
  }
  return <Dashboard data={data} setData={setData} onReset={reset} />;
}
