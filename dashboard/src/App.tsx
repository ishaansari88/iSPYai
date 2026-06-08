import { useEffect } from "react";
import {
  WSEvents,
  type AnalysisUpdatedPayload,
  type LogNewPayload,
  type SessionsSnapshotPayload,
} from "@ispyai/shared";
import { getSocket } from "./lib/socket";
import { fetchSessions } from "./lib/api";
import { useDashboardStore } from "./store/dashboardStore";
import { SessionSidebar } from "./components/SessionSidebar";
import { LogTable } from "./components/LogTable";
import { LogDetailPanel } from "./components/LogDetailPanel";
import { TopBar } from "./components/TopBar";
import { Tabs } from "./components/Tabs";
import { Filters } from "./components/Filters";
import { AIAnalysisPanel } from "./components/AIAnalysisPanel";
import { SessionExplorer } from "./components/SessionExplorer";

// Top-level shell. The first useEffect owns all socket lifecycle so individual
// components can stay declarative and read from the Zustand store.
export default function App(): JSX.Element {
  const setSessions = useDashboardStore((s) => s.setSessions);
  const appendLog = useDashboardStore((s) => s.appendLog);
  const setConnected = useDashboardStore((s) => s.setConnected);
  const setAnalysis = useDashboardStore((s) => s.setAnalysis);
  const setActiveSession = useDashboardStore((s) => s.setActiveSession);
  const setViewerMode = useDashboardStore((s) => s.setViewerMode);
  const activeSessionId = useDashboardStore((s) => s.activeSessionId);
  const viewTab = useDashboardStore((s) => s.viewTab);

  // Read-only share-link bootstrap: a `?session=<id>` query param locks the
  // sidebar selection and hides destructive actions in the top bar.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("session");
    if (id) {
      setActiveSession(id);
      setViewerMode(true);
    }
  }, [setActiveSession, setViewerMode]);

  useEffect(() => {
    const socket = getSocket();

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onSnapshot = (payload: SessionsSnapshotPayload) => {
      setSessions(payload.sessions);
    };
    const onLogNew = (payload: LogNewPayload) => {
      appendLog(payload);
    };
    const onAnalysis = (payload: AnalysisUpdatedPayload) => {
      setAnalysis(payload.analysis.sessionId, payload.analysis);
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on(WSEvents.SessionsSnapshot, onSnapshot);
    socket.on(WSEvents.LogNew, onLogNew);
    socket.on(WSEvents.AnalysisUpdated, onAnalysis);

    // Belt-and-suspenders: HTTP fetch covers the case where the socket hasn't
    // yet fired its first snapshot when the user lands on the page.
    fetchSessions()
      .then(setSessions)
      .catch(() => {
        // Non-fatal: realtime snapshot will fill in shortly.
      });

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off(WSEvents.SessionsSnapshot, onSnapshot);
      socket.off(WSEvents.LogNew, onLogNew);
      socket.off(WSEvents.AnalysisUpdated, onAnalysis);
    };
  }, [setSessions, appendLog, setConnected, setAnalysis]);

  // Manage room membership whenever the active session changes.
  useEffect(() => {
    if (!activeSessionId) return;
    const socket = getSocket();
    socket.emit(WSEvents.SessionJoined, { sessionId: activeSessionId });
    return () => {
      socket.emit(WSEvents.SessionLeft, { sessionId: activeSessionId });
    };
  }, [activeSessionId]);

  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <SessionSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Tabs />
          {viewTab !== "ai" && <Filters />}
          <div className="flex min-h-0 flex-1">
            <CenterPane />
            <LogDetailPanel />
          </div>
        </div>
      </div>
    </div>
  );
}

function CenterPane(): JSX.Element {
  const viewTab = useDashboardStore((s) => s.viewTab);
  switch (viewTab) {
    case "failed":
      return <LogTable failuresOnly />;
    case "explorer":
      return <SessionExplorer />;
    case "ai":
      return <AIAnalysisPanel />;
    case "live":
    default:
      return <LogTable />;
  }
}
