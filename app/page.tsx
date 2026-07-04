"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import Onboarding from "@/components/Onboarding";
import Lab from "@/components/Lab";
import MyBots from "@/components/MyBots";
import Compare from "@/components/Compare";
import LiveDesk from "@/components/LiveDesk";
import BotHub from "@/components/BotHub";
import Learn from "@/components/Learn";
import SignIn from "@/components/SignIn";
import { BotIdentity, toConfig } from "@/lib/bot";
import { BotConfig } from "@/lib/types";
import { SavedBot, LabSeed, BotMetrics, loadBots, upsertBot, newId, setUser, fetchBots, migrateLocalBots } from "@/lib/storage";
import { supabase } from "@/lib/supabase";

type View = "intro" | "home" | "lab" | "compare" | "live" | "hub" | "learn";

interface SavePayload {
  id?: string;
  name: string;
  color: string;
  symbol: string;
  config: BotConfig;
  metrics: BotMetrics;
}

export default function Home() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [view, setView] = useState<View>("home");
  const [bots, setBots] = useState<SavedBot[]>([]);
  const [seed, setSeed] = useState<LabSeed | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hubTab, setHubTab] = useState<"overview" | "performance" | "training" | "settings">("overview");
  const [ready, setReady] = useState(false);

  // Auth session
  useEffect(() => {
    if (!supabase) {
      setSession(null);
      return;
    }
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Once signed in, load cloud bots (and migrate any local ones once).
  useEffect(() => {
    if (session === undefined) return;
    if (session?.user) {
      setUser(session.user.id);
      (async () => {
        await fetchBots();
        await migrateLocalBots();
        const b = loadBots();
        setBots(b);
        setView(b.length === 0 ? "intro" : "home");
        setReady(true);
      })();
    } else {
      setUser(null);
      setReady(false);
    }
  }, [session]);

  async function signOut() {
    await supabase?.auth.signOut();
    setBots([]);
    setReady(false);
  }

  if (session === undefined) return null;
  if (!session) return <SignIn />;
  if (!ready) return null;

  function completeOnboarding(identity: BotIdentity) {
    const bot: SavedBot = {
      id: newId(),
      name: identity.name || "My Bot",
      color: identity.color,
      symbol: identity.symbol,
      config: toConfig(identity),
      createdAt: Date.now(),
      level: 1,
      xp: 0,
      trainings: 0,
      best: null,
      schedule: { enabled: false, lastTrained: null },
    };
    setBots(upsertBot(bot));
    setSeed({ id: bot.id, name: bot.name, color: bot.color, symbol: bot.symbol, config: bot.config });
    setView("lab");
  }

  function saveFromLab(p: SavePayload) {
    const existing = p.id ? bots.find((b) => b.id === p.id) : undefined;
    const bot: SavedBot = existing
      ? { ...existing, name: p.name, color: p.color, symbol: p.symbol, config: p.config, best: p.metrics }
      : {
          id: newId(),
          name: p.name,
          color: p.color,
          symbol: p.symbol,
          config: p.config,
          createdAt: Date.now(),
          level: 1,
          xp: 0,
          trainings: 0,
          best: p.metrics,
          schedule: { enabled: false, lastTrained: null },
        };
    setBots(upsertBot(bot));
    if (!p.id) setSeed((s) => (s ? { ...s, id: bot.id } : s));
  }

  if (view === "intro") {
    return <Onboarding onComplete={completeOnboarding} onSkip={() => { setSeed(null); setView("lab"); }} />;
  }
  if (view === "compare") {
    const selected = bots.filter((b) => compareIds.includes(b.id));
    return <Compare bots={selected} onBack={() => setView("home")} />;
  }
  if (view === "live") {
    return <LiveDesk bots={bots} setBots={setBots} onBack={() => setView("home")} />;
  }
  if (view === "learn") {
    return <Learn onBack={() => setView("home")} />;
  }
  if (view === "hub") {
    const hubBot = bots.find((b) => b.id === selectedId);
    if (hubBot) {
      return <BotHub bot={hubBot} setBots={setBots} onBack={() => setView("home")} onOpenLab={(s) => { setSeed(s); setView("lab"); }} initialTab={hubTab} />;
    }
    setView("home");
    return null;
  }
  if (view === "lab") {
    return <Lab seed={seed} onHome={() => setView("home")} onSave={saveFromLab} />;
  }

  return (
    <MyBots
      bots={bots}
      setBots={setBots}
      onOpen={(bot) => { setSeed({ id: bot.id, name: bot.name, color: bot.color, symbol: bot.symbol, config: bot.config }); setView("lab"); }}
      onNewBot={() => setView("intro")}
      onOpenLab={() => { setSeed(null); setView("lab"); }}
      onCompare={(ids) => { setCompareIds(ids); setView("compare"); }}
      onGoLive={() => setView("live")}
      onOpenBot={(bot) => { setSelectedId(bot.id); setHubTab("overview"); setView("hub"); }}
      onTrainBot={(bot) => { setSelectedId(bot.id); setHubTab("training"); setView("hub"); }}
      onLearn={() => setView("learn")}
      onSignOut={signOut}
    />
  );
}
