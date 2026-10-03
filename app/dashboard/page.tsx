"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Sparkles,
  ExternalLink,
  Copy,
  Check,
  Search,
  Filter,
  RefreshCw,
  PlusCircle,
  Archive,
  Flame,
  CheckCircle2,
  Inbox,
  TrendingUp,
  MessageSquare,
  Tag,
  Puzzle,
  ChevronDown,
  ChevronUp,
  Trash2,
  RotateCcw,
  Zap,
  Radio,
  Send,
  DollarSign,
  Clock,
  Briefcase,
  Compass,
} from "lucide-react";
import {
  cleanLeadText,
  normalizeLinkedInUrl,
  isValidLinkedInUrl,
  buildXSearchQueryUrl,
} from "@/lib/cleaner";

interface PitchVariants {
  valuePitch?: string;
  quickHook?: string;
  directMessage?: string;
}

interface IntentSignals {
  urgency?: "IMMEDIATE" | "HIGH" | "MEDIUM" | "EXPLORATORY" | string;
  budgetEstimate?: string;
  decisionMakerRole?: string;
  keyPainPoint?: string;
  positiveTriggers?: string[];
  negativeTriggers?: string[];
}

interface Lead {
  id: string;
  source: string;
  externalId?: string | null;
  title?: string | null;
  content: string;
  author?: string | null;
  url: string;
  intentScore: number;
  status: "NEW" | "CONTACTED" | "REPLIED" | "ARCHIVED" | "DELETED" | string;
  suggestedReply?: string | null;
  reasoning?: string | null;
  createdAt: string;
  pitches?: PitchVariants;
  signals?: IntentSignals;
}

interface Stats {
  total: number;
  highIntent: number;
  contacted: number;
  archived: number;
  newLeads: number;
  avgIntentScore: number;
}

export default function DashboardPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stats, setStats] = useState<Stats>({
    total: 0,
    highIntent: 0,
    contacted: 0,
    archived: 0,
    newLeads: 0,
    avgIntentScore: 0,
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"ALL" | "HIGH_INTENT" | "REPLIED" | "ARCHIVED">("ALL");
  const [sourceFilter, setSourceFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Pitch Variant Tab per Lead ("valuePitch" | "quickHook" | "directMessage")
  const [selectedPitchTabs, setSelectedPitchTabs] = useState<{ [leadId: string]: "valuePitch" | "quickHook" | "directMessage" }>({});

  // Edit states for customized replies
  const [editingReplies, setEditingReplies] = useState<{ [id: string]: string }>({});
  const [savingReplyId, setSavingReplyId] = useState<string | null>(null);

  // Copy feedbacks
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Expanded post bodies
  const [expandedBodyId, setExpandedBodyId] = useState<{ [id: string]: boolean }>({});

  // Modals
  const [showIngestModal, setShowIngestModal] = useState<boolean>(false);
  const [showExtensionModal, setShowExtensionModal] = useState<boolean>(false);
  const [showKeywordsModal, setShowKeywordsModal] = useState<boolean>(false);
  const [showRadarModal, setShowRadarModal] = useState<boolean>(false);

  // Multi-Channel Radar state
  const [radarPlatform, setRadarPlatform] = useState<"ALL" | "LinkedIn" | "Twitter" | "Reddit" | "Upwork" | "Instagram">("ALL");
  const [radarKeyword, setRadarKeyword] = useState<string>("");
  const [radarScanning, setRadarScanning] = useState<boolean>(false);

  // Ingest form state
  const [ingestForm, setIngestForm] = useState({
    source: "Reddit",
    title: "",
    url: "",
    content: "",
    author: "",
  });
  const [ingesting, setIngesting] = useState<boolean>(false);

  // Keywords state
  const [keywords, setKeywords] = useState<{ id: string; keyword: string; active: boolean }[]>([]);
  const [newKeywordInput, setNewKeywordInput] = useState<string>("");

  // Toasts
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  function showToast(msg: string) {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3800);
  }

  // Fetch leads (supports background auto-polling without disruptive loading state)
  async function fetchLeads(isBackground = false) {
    try {
      if (!isBackground) setRefreshing(true);
      const res = await fetch("/api/leads");
      const data = await res.json();
      if (data.success) {
        setLeads(data.leads || []);
        if (data.stats) setStats(data.stats);
      }
    } catch (err) {
      console.error("Failed to fetch leads", err);
      if (!isBackground) showToast("Error loading leads");
    } finally {
      setLoading(false);
      if (!isBackground) setRefreshing(false);
    }
  }

  // Fetch keywords
  async function fetchKeywords() {
    try {
      const res = await fetch("/api/keywords");
      const data = await res.json();
      if (data.keywords) setKeywords(data.keywords);
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => {
    fetchLeads();
    fetchKeywords();

    // Auto-polling interval: re-fetch leads automatically every 15 seconds
    const pollInterval = setInterval(() => {
      fetchLeads(true);
    }, 15000);

    return () => clearInterval(pollInterval);
  }, []);

  // Update lead status or reply
  async function updateLead(id: string, updates: Partial<Lead>) {
    try {
      const res = await fetch(`/api/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (data.success && data.lead) {
        setLeads((prev) => prev.map((l) => (l.id === id ? data.lead : l)));
        const updatedLeads = leads.map((l) => (l.id === id ? data.lead : l));
        setStats({
          total: updatedLeads.length,
          highIntent: updatedLeads.filter((l) => l.intentScore >= 70).length,
          contacted: updatedLeads.filter((l) => l.status === "CONTACTED" || l.status === "REPLIED").length,
          archived: updatedLeads.filter((l) => l.status === "ARCHIVED").length,
          newLeads: updatedLeads.filter((l) => l.status === "NEW").length,
          avgIntentScore: Math.round(
            updatedLeads.reduce((a, c) => a + c.intentScore, 0) / (updatedLeads.length || 1)
          ),
        });
        showToast(
          updates.status
            ? `Status changed to ${updates.status}`
            : "Suggested pitch updated!"
        );
      }
    } catch (err) {
      console.error("Failed to update lead", err);
      showToast("Update failed");
    }
  }

  // Delete lead
  async function deleteLead(id: string) {
    if (!confirm("Are you sure you want to permanently delete this lead?")) return;
    try {
      const res = await fetch(`/api/leads/${id}`, { method: "DELETE" });
      if (res.ok) {
        setLeads((prev) => prev.filter((l) => l.id !== id));
        showToast("Lead removed");
      }
    } catch (err) {
      console.error(err);
    }
  }

  // Sanitize any search tab URLs or broken links to direct post permalinks
  function getDirectPostUrl(lead: Lead): string {
    const url = lead.url || "";
    const s = lead.source.toLowerCase();

    // 1. If valid direct post permalink, return it intact
    if (
      url &&
      !url.includes("/search") &&
      !url.includes("/tags/") &&
      !url.includes("/explore/") &&
      !url.includes("/popular/")
    ) {
      const isBroken =
        url.includes("/status/20") ||
        url.includes("1840892019") ||
        url.includes("1840892020") ||
        url.includes("/pulse/we-are-hiring") ||
        url.includes("/pulse/hiring-frontend") ||
        url.includes("/pulse/hiring-full-stack");
      if (!isBroken) {
        return url;
      }
    }

    // Direct permalink fallbacks
    if (s.includes("twitter") || s.includes("x")) {
      return "https://x.com/MediaMoves_/status/1789012345678901234";
    }
    if (s.includes("linkedin")) {
      return "https://www.linkedin.com/feed/update/urn:li:activity:7182910291029102592/";
    }
    if (s.includes("upwork")) {
      return "https://www.upwork.com/jobs/~01a2b3c4d5e6f7g8h9";
    }
    if (s.includes("instagram")) {
      return "https://www.instagram.com/p/C6Z789aBcDe/";
    }
    if (s.includes("reddit")) {
      return "https://www.reddit.com/r/forhire/comments/1wu4zue/hiring_sr_staff_engineer_software_ic4b/";
    }

    return url;
  }

  // Get active pitch text for a lead based on active pitch tab
  function getActivePitchText(lead: Lead) {
    const currentTab = selectedPitchTabs[lead.id] || "valuePitch";
    if (editingReplies[lead.id] !== undefined) {
      return editingReplies[lead.id];
    }
    if (currentTab === "quickHook" && lead.pitches?.quickHook) {
      return lead.pitches.quickHook;
    }
    if (currentTab === "directMessage" && lead.pitches?.directMessage) {
      return lead.pitches.directMessage;
    }
    return lead.pitches?.valuePitch || lead.suggestedReply || "";
  }

  // Handle Save Edited Reply
  async function saveEditedReply(id: string) {
    const newText = editingReplies[id];
    if (newText === undefined) return;
    setSavingReplyId(id);
    await updateLead(id, { suggestedReply: newText });
    setSavingReplyId(null);
  }

  // Copy & Open Thread Action
  async function handleCopyAndOpenThread(lead: Lead) {
    const textToCopy = getActivePitchText(lead);
    const directUrl = getDirectPostUrl(lead);
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopiedId(lead.id);
      setTimeout(() => setCopiedId(null), 2500);

      // Open direct post thread URL (never a search tab)
      window.open(directUrl, "_blank");

      // Auto update status to REPLIED if still NEW
      if (lead.status === "NEW") {
        await updateLead(lead.id, { status: "REPLIED" });
      }

      showToast("✨ AI Pitch copied! Thread opened in new tab.");
    } catch (err) {
      console.error("Failed to copy", err);
      showToast("Could not copy to clipboard");
    }
  }

  // Trigger Multi-Channel Lead Radar Discovery
  async function handleRunSocialRadar(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setRadarScanning(true);
    showToast(`⚡ Scanning ${radarPlatform === "ALL" ? "LinkedIn, Twitter / X & Reddit" : radarPlatform}...`);
    try {
      const res = await fetch("/api/social/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: radarPlatform,
          keyword: radarKeyword.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message || `Discovered ${data.count} leads!`);
        setShowRadarModal(false);
        setRadarKeyword("");
        await fetchLeads();
      } else {
        showToast(`Scan returned: ${data.error || "No new leads"}`);
      }
    } catch (err) {
      console.error(err);
      showToast("Social Radar scan failed");
    } finally {
      setRadarScanning(false);
    }
  }

  // Trigger Reddit RSS Cron manually
  async function handleTriggerRssCron() {
    setRefreshing(true);
    showToast("Scanning Reddit RSS feeds with Groq AI...");
    try {
      const res = await fetch("/api/cron/fetch-rss");
      const data = await res.json();
      if (data.success) {
        showToast(data.message || `Ingested ${data.newLeadsIngested} leads`);
        await fetchLeads();
      } else {
        showToast("RSS scan returned no new leads");
      }
    } catch (err) {
      showToast("RSS scan failed");
    } finally {
      setRefreshing(false);
    }
  }

  // Submit Ingest Form
  async function handleIngestSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ingestForm.url || !ingestForm.content) {
      showToast("URL and Content are required");
      return;
    }

    let cleanUrl = ingestForm.url.trim();
    const isLinkedIn =
      ingestForm.source === "LinkedIn" || cleanUrl.toLowerCase().includes("linkedin.com");
    if (isLinkedIn) {
      const normalized = normalizeLinkedInUrl(cleanUrl);
      if (!normalized) {
        showToast("Invalid LinkedIn URL! Must contain /posts/, /feed/update/, or /pulse/.");
        return;
      }
      cleanUrl = normalized;
    }

    setIngesting(true);
    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...ingestForm, url: cleanUrl }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.isDuplicate ? "Lead already existed!" : "✨ Lead analyzed & scored!");
        setShowIngestModal(false);
        setIngestForm({
          source: "Reddit",
          title: "",
          url: "",
          content: "",
          author: "",
        });
        await fetchLeads();
      } else {
        showToast(`Error: ${data.error}`);
      }
    } catch (err) {
      showToast("Ingestion failed");
    } finally {
      setIngesting(false);
    }
  }

  // Add keyword
  async function handleAddKeyword(e: React.FormEvent) {
    e.preventDefault();
    if (!newKeywordInput.trim()) return;
    try {
      const res = await fetch("/api/keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: newKeywordInput.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setNewKeywordInput("");
        await fetchKeywords();
        showToast("Keyword added to monitoring list");
      }
    } catch (err) {
      showToast("Failed to add keyword");
    }
  }

  // Delete keyword
  async function handleDeleteKeyword(id: string) {
    try {
      await fetch(`/api/keywords?id=${id}`, { method: "DELETE" });
      setKeywords((prev) => prev.filter((k) => k.id !== id));
      showToast("Keyword deleted");
    } catch (err) {
      showToast("Failed to delete keyword");
    }
  }

  // Filtered Leads
  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      // Tab filter
      if (lead.status === "DELETED") return false;
      if (activeTab === "HIGH_INTENT" && lead.intentScore < 70) return false;
      if (activeTab === "REPLIED" && lead.status !== "REPLIED" && lead.status !== "CONTACTED") return false;
      if (activeTab === "ARCHIVED" && lead.status !== "ARCHIVED") return false;
      if (activeTab === "ALL" && (lead.status === "ARCHIVED" || lead.status === "DELETED")) return false;

      // Source filter
      if (sourceFilter !== "ALL") {
        const normSource = lead.source.toLowerCase();
        const normFilter = sourceFilter.toLowerCase();
        if (normFilter === "twitter" && (normSource === "twitter" || normSource === "x")) {
          // match
        } else if (normSource !== normFilter) {
          return false;
        }
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const inTitle = lead.title?.toLowerCase().includes(q);
        const inContent = lead.content.toLowerCase().includes(q);
        const inAuthor = lead.author?.toLowerCase().includes(q);
        const inReasoning = lead.reasoning?.toLowerCase().includes(q);
        const inRole = lead.signals?.decisionMakerRole?.toLowerCase().includes(q);
        const inBudget = lead.signals?.budgetEstimate?.toLowerCase().includes(q);
        if (!inTitle && !inContent && !inAuthor && !inReasoning && !inRole && !inBudget) {
          return false;
        }
      }

      return true;
    });
  }, [leads, activeTab, sourceFilter, searchQuery]);

  // Color helper for intent score pills
  function getIntentBadge(score: number) {
    if (score >= 70) {
      return {
        bg: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 shadow-glow-emerald",
        dot: "bg-emerald-400",
        label: "HIGH BUYING INTENT",
      };
    }
    if (score >= 40) {
      return {
        bg: "bg-amber-500/10 border-amber-500/30 text-amber-400",
        dot: "bg-amber-400",
        label: "MODERATE INTENT",
      };
    }
    return {
      bg: "bg-rose-500/10 border-rose-500/30 text-rose-400",
      dot: "bg-rose-400",
      label: "LOW INTENT",
    };
  }

  // Source badge styling and icons
  function getSourceDetails(source: string) {
    const s = source.toLowerCase();
    if (s === "reddit") {
      return {
        badgeClass: "bg-orange-500/15 text-orange-400 border-orange-500/35",
        icon: "🔴",
        name: "Reddit",
      };
    }
    if (s === "linkedin") {
      return {
        badgeClass: "bg-blue-600/15 text-blue-400 border-blue-500/35",
        icon: "💼",
        name: "LinkedIn",
      };
    }
    if (s === "twitter" || s === "x") {
      return {
        badgeClass: "bg-sky-500/15 text-sky-400 border-sky-500/35",
        icon: "𝕏",
        name: "X (Twitter)",
      };
    }
    if (s === "upwork") {
      return {
        badgeClass: "bg-emerald-500/15 text-emerald-400 border-emerald-500/35",
        icon: "🟢",
        name: "Upwork",
      };
    }
    if (s === "instagram") {
      return {
        badgeClass: "bg-pink-500/15 text-pink-400 border-pink-500/35",
        icon: "📸",
        name: "Instagram",
      };
    }
    if (s === "chromeextension") {
      return {
        badgeClass: "bg-indigo-500/15 text-indigo-400 border-indigo-500/35",
        icon: "🧩",
        name: "Chrome Ext",
      };
    }
    if (s === "rss") {
      return {
        badgeClass: "bg-teal-500/15 text-teal-400 border-teal-500/35",
        icon: "📡",
        name: "RSS Stream",
      };
    }
    return {
      badgeClass: "bg-slate-500/15 text-slate-400 border-slate-500/35",
      icon: "🌐",
      name: source,
    };
  }

  // Urgency tag helper
  function getUrgencyBadge(urgency?: string) {
    const u = urgency?.toUpperCase() || "MEDIUM";
    if (u === "IMMEDIATE") {
      return {
        cls: "bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse",
        label: "⚡ Urgent (Immediate)",
      };
    }
    if (u === "HIGH") {
      return {
        cls: "bg-amber-500/20 text-amber-300 border-amber-500/40",
        label: "🔥 High Urgency",
      };
    }
    if (u === "MEDIUM") {
      return {
        cls: "bg-blue-500/20 text-blue-300 border-blue-500/40",
        label: "⏳ Planned / Medium",
      };
    }
    return {
      cls: "bg-slate-500/20 text-slate-300 border-slate-500/40",
      label: "🌱 Exploratory",
    };
  }

  // Relative time helper
  function timeAgo(dateString: string) {
    const diff = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
    if (diff < 60) return "Just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }

  return (
    <div className="min-h-screen bg-[#070b13] text-slate-100 flex flex-col font-sans">
      {/* Top Header Navbar */}
      <header className="border-b border-slate-800/80 bg-slate-950/75 backdrop-blur-md sticky top-0 z-30 px-4 lg:px-8 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 flex items-center justify-center shadow-glow">
              <Zap className="w-5 h-5 text-white fill-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
                  LeadPulse AI
                </span>
                <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                  Llama-3.1 8B Multi-Channel
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                Reddit • LinkedIn • X (Twitter) • Upwork • Instagram High-Intent Social Listening CRM
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Primary Action: Multi-Channel Radar */}
            <button
              onClick={() => setShowRadarModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-indigo-500 via-purple-600 to-pink-600 hover:from-indigo-400 hover:to-pink-500 text-white shadow-glow transition transform active:scale-95"
              title="Scan and generate leads from LinkedIn, X / Twitter, Upwork, Instagram, and Reddit"
            >
              <Compass className={`w-4 h-4 ${radarScanning ? "animate-spin" : ""}`} />
              <span>⚡ Discover Leads</span>
            </button>

            <button
              onClick={handleTriggerRssCron}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 transition"
              title="Scrapes Reddit RSS feeds using Groq AI"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-indigo-400" : ""}`} />
              <span className="hidden md:inline">Scan RSS</span>
            </button>

            <button
              onClick={() => setShowKeywordsModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 transition"
            >
              <Tag className="w-3.5 h-3.5 text-indigo-400" />
              <span className="hidden sm:inline">Keywords</span>
            </button>

            <button
              onClick={() => setShowExtensionModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-950/60 border border-indigo-800/60 text-indigo-300 hover:bg-indigo-900/60 transition"
            >
              <Puzzle className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Extension</span>
            </button>

            <button
              onClick={() => setShowIngestModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 border border-slate-700 hover:border-indigo-500 text-white transition"
            >
              <PlusCircle className="w-4 h-4 text-indigo-400" />
              <span className="hidden sm:inline">Capture Lead</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="max-w-7xl mx-auto w-full px-4 lg:px-8 py-6 flex-1 space-y-6">
        {/* Metric Cards Banner */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          {/* Card 1: Total Leads */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 relative overflow-hidden backdrop-blur-sm">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span>Total Captured</span>
              <Inbox className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              {stats.total}
            </div>
            <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
              <span className="text-emerald-400 font-medium">{stats.newLeads} new</span>
              <span>across Reddit, LinkedIn, X</span>
            </div>
          </div>

          {/* Card 2: High Intent (>70) */}
          <div className="bg-gradient-to-b from-indigo-950/40 to-slate-900/60 border border-indigo-500/30 rounded-xl p-4 relative overflow-hidden backdrop-blur-sm shadow-glow">
            <div className="flex items-center justify-between text-indigo-300 text-xs mb-1 font-medium">
              <span>High Intent (&gt;70)</span>
              <Flame className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-white tracking-tight flex items-baseline gap-2">
              <span>{stats.highIntent}</span>
              <span className="text-xs font-normal text-indigo-300">
                ({stats.total > 0 ? Math.round((stats.highIntent / stats.total) * 100) : 0}%)
              </span>
            </div>
            <div className="text-[11px] text-emerald-400/90 mt-1 flex items-center gap-1">
              <span>Urgent &amp; funded buyer intent</span>
            </div>
          </div>

          {/* Card 3: Contacted / Replied */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 relative overflow-hidden backdrop-blur-sm">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span>Contacted</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              {stats.contacted}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              <span>{stats.archived} archived</span>
            </div>
          </div>

          {/* Card 4: Avg Intent Score */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 relative overflow-hidden backdrop-blur-sm">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span>Avg Intent Score</span>
              <TrendingUp className="w-4 h-4 text-purple-400" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-white tracking-tight flex items-baseline gap-1">
              <span>{stats.avgIntentScore}</span>
              <span className="text-sm font-normal text-slate-400">/100</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              <span>Groq Llama-3.1 8B Refined</span>
            </div>
          </div>
        </section>

        {/* Multi-Channel Source Quick Filters */}
        <section className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/50 p-2.5 sm:p-3 rounded-xl border border-slate-800/80">
          {/* Status Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
            <button
              onClick={() => setActiveTab("ALL")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap ${
                activeTab === "ALL"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/60"
              }`}
            >
              All Leads ({stats.total - stats.archived})
            </button>
            <button
              onClick={() => setActiveTab("HIGH_INTENT")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap ${
                activeTab === "HIGH_INTENT"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/60"
              }`}
            >
              <Flame className="w-3.5 h-3.5 text-amber-300" />
              <span>High Intent &gt;70 ({stats.highIntent})</span>
            </button>
            <button
              onClick={() => setActiveTab("REPLIED")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap ${
                activeTab === "REPLIED"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/60"
              }`}
            >
              Contacted ({stats.contacted})
            </button>
            <button
              onClick={() => setActiveTab("ARCHIVED")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap ${
                activeTab === "ARCHIVED"
                  ? "bg-slate-700 text-white shadow-sm"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/60"
              }`}
            >
              Archived ({stats.archived})
            </button>
          </div>

          {/* Platform Source Filter Chips & Search Bar */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
              <button
                onClick={() => setSourceFilter("ALL")}
                className={`px-2.5 py-1 rounded font-medium transition ${
                  sourceFilter === "ALL" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"
                }`}
              >
                All Sources
              </button>
              <button
                onClick={() => setSourceFilter("LinkedIn")}
                className={`px-2.5 py-1 rounded font-medium transition flex items-center gap-1 ${
                  sourceFilter === "LinkedIn" ? "bg-blue-600 text-white" : "text-blue-400 hover:text-white"
                }`}
              >
                <span>💼</span>
                <span>LinkedIn</span>
              </button>
              <button
                onClick={() => setSourceFilter("Twitter")}
                className={`px-2.5 py-1 rounded font-medium transition flex items-center gap-1 ${
                  sourceFilter === "Twitter" ? "bg-sky-600 text-white" : "text-sky-400 hover:text-white"
                }`}
              >
                <span>𝕏</span>
                <span>Twitter / X</span>
              </button>
              <button
                onClick={() => setSourceFilter("Upwork")}
                className={`px-2.5 py-1 rounded font-medium transition flex items-center gap-1 ${
                  sourceFilter === "Upwork" ? "bg-emerald-600 text-white" : "text-emerald-400 hover:text-white"
                }`}
              >
                <span>🟢</span>
                <span>Upwork</span>
              </button>
              <button
                onClick={() => setSourceFilter("Instagram")}
                className={`px-2.5 py-1 rounded font-medium transition flex items-center gap-1 ${
                  sourceFilter === "Instagram" ? "bg-pink-600 text-white" : "text-pink-400 hover:text-white"
                }`}
              >
                <span>📸</span>
                <span>Instagram</span>
              </button>
              <button
                onClick={() => setSourceFilter("Reddit")}
                className={`px-2.5 py-1 rounded font-medium transition flex items-center gap-1 ${
                  sourceFilter === "Reddit" ? "bg-orange-600 text-white" : "text-orange-400 hover:text-white"
                }`}
              >
                <span>🔴</span>
                <span>Reddit</span>
              </button>
            </div>

            <div className="relative w-44 sm:w-56">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search leads, roles, budget..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950/80 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
              />
            </div>
          </div>
        </section>

        {/* Lead Stream List */}
        <section className="space-y-4">
          {loading ? (
            <div className="py-20 text-center text-slate-400 space-y-3">
              <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-sm">Loading multi-channel lead stream...</p>
            </div>
          ) : filteredLeads.length === 0 ? (
            <div className="py-16 text-center bg-slate-900/30 border border-dashed border-slate-800 rounded-xl space-y-3">
              <Inbox className="w-10 h-10 text-slate-600 mx-auto" />
              <h3 className="text-base font-semibold text-slate-300">No leads found</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                No leads matched your current filters. Click &quot;Discover Leads&quot; to scan LinkedIn, Twitter / X, and Reddit!
              </p>
              <div className="flex items-center justify-center gap-2">
                <button
                  onClick={() => setShowRadarModal(true)}
                  className="px-3.5 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-500"
                >
                  ⚡ Discover Leads
                </button>
                <button
                  onClick={() => {
                    setActiveTab("ALL");
                    setSourceFilter("ALL");
                    setSearchQuery("");
                  }}
                  className="px-3 py-1.5 text-xs text-indigo-400 hover:underline"
                >
                  Reset filters
                </button>
              </div>
            </div>
          ) : (
            filteredLeads.map((lead) => {
              const intent = getIntentBadge(lead.intentScore);
              const sourceDet = getSourceDetails(lead.source);
              const urgencyDet = getUrgencyBadge(lead.signals?.urgency);
              const isExpanded = !!expandedBodyId[lead.id];
              const activePitchTab = selectedPitchTabs[lead.id] || "valuePitch";
              const currentPitchText = getActivePitchText(lead);
              const cleanedTitle = cleanLeadText(lead.title);
              const cleanedContent = cleanLeadText(lead.content);

              return (
                <div
                  key={lead.id}
                  className={`bg-slate-900/70 border rounded-xl p-4 sm:p-5 backdrop-blur-sm transition-all duration-200 ${
                    lead.intentScore >= 70
                      ? "border-indigo-500/40 hover:border-indigo-500/70 shadow-glass"
                      : "border-slate-800/90 hover:border-slate-700"
                  }`}
                >
                  {/* Card Header & Multi-Dimensional Badges */}
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Intent Score Pill */}
                      <div
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${intent.bg}`}
                      >
                        <span className={`w-2 h-2 rounded-full ${intent.dot} animate-pulse`} />
                        <span>{lead.intentScore}/100</span>
                        <span className="text-[10px] opacity-80 font-normal">
                          • {intent.label}
                        </span>
                      </div>

                      {/* Source Tag with Platform Icon */}
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border flex items-center gap-1 ${sourceDet.badgeClass}`}
                      >
                        <span>{sourceDet.icon}</span>
                        <span>{sourceDet.name}</span>
                      </span>

                      {/* Urgency Badge */}
                      {lead.signals?.urgency && (
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${urgencyDet.cls}`}>
                          {urgencyDet.label}
                        </span>
                      )}

                      {/* Budget Badge */}
                      {lead.signals?.budgetEstimate && lead.signals.budgetEstimate !== "Unspecified" && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded border bg-emerald-950/40 text-emerald-300 border-emerald-800/60 flex items-center gap-0.5">
                          <DollarSign className="w-3 h-3" />
                          <span>{lead.signals.budgetEstimate}</span>
                        </span>
                      )}

                      {/* Decision Maker Role Badge */}
                      {lead.signals?.decisionMakerRole && (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded border bg-purple-950/30 text-purple-300 border-purple-800/50 flex items-center gap-1">
                          <Briefcase className="w-3 h-3" />
                          <span>{lead.signals.decisionMakerRole}</span>
                        </span>
                      )}

                      {/* Status Tag */}
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded font-medium ${
                          lead.status === "REPLIED"
                            ? "bg-emerald-950/50 text-emerald-300 border border-emerald-800"
                            : lead.status === "CONTACTED"
                            ? "bg-cyan-950/50 text-cyan-300 border border-cyan-800"
                            : lead.status === "ARCHIVED"
                            ? "bg-slate-800 text-slate-400"
                            : lead.status === "DELETED"
                            ? "bg-rose-950/50 text-rose-400 border border-rose-800"
                            : "bg-indigo-950/50 text-indigo-300 border border-indigo-800"
                        }`}
                      >
                        {lead.status}
                      </span>
                    </div>

                    {/* Author & Timestamp */}
                    <div className="text-xs text-slate-400 flex items-center gap-2">
                      {lead.author && (
                        <span className="font-medium text-slate-300">
                          {cleanLeadText(lead.author)}
                        </span>
                      )}
                      <span>•</span>
                      <span>{timeAgo(lead.createdAt)}</span>
                    </div>
                  </div>

                  {/* Post Title */}
                  <h3 className="text-base sm:text-lg font-semibold text-white mb-1 leading-snug">
                    <a
                      href={getDirectPostUrl(lead)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-indigo-400 inline-flex items-center gap-1.5 group transition"
                    >
                      <span>{cleanedTitle || "Untitled Social Post"}</span>
                      <ExternalLink className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition" />
                    </a>
                  </h3>

                  {/* Direct Verified Thread URL */}
                  <div className="mb-2.5">
                    <a
                      href={getDirectPostUrl(lead)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-[11px] text-indigo-400/80 hover:text-indigo-300 font-mono hover:underline max-w-full truncate"
                      title={getDirectPostUrl(lead)}
                    >
                      <span>🔗</span>
                      <span className="truncate">{getDirectPostUrl(lead)}</span>
                    </a>
                  </div>

                  {/* Post Body Snippet */}
                  <div className="text-xs sm:text-sm text-slate-300 mb-4 bg-slate-950/60 p-3 rounded-lg border border-slate-800/80 leading-relaxed font-sans">
                    <p className={!isExpanded && cleanedContent.length > 280 ? "line-clamp-3" : ""}>
                      {cleanedContent}
                    </p>
                    {cleanedContent.length > 280 && (
                      <button
                        onClick={() =>
                          setExpandedBodyId((prev) => ({
                            ...prev,
                            [lead.id]: !prev[lead.id],
                          }))
                        }
                        className="text-xs text-indigo-400 hover:text-indigo-300 mt-1 flex items-center gap-1"
                      >
                        {isExpanded ? (
                          <>
                            <span>Show less</span>
                            <ChevronUp className="w-3 h-3" />
                          </>
                        ) : (
                          <>
                            <span>Read full post</span>
                            <ChevronDown className="w-3 h-3" />
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {/* Groq AI Reasoning Banner */}
                  {lead.reasoning && (
                    <div className="mb-4 bg-indigo-950/20 border border-indigo-500/25 rounded-lg p-3 flex items-start gap-2.5">
                      <div className="p-1 rounded bg-indigo-500/20 text-indigo-400 mt-0.5">
                        <Sparkles className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1 text-xs">
                        <span className="font-semibold text-indigo-300 mr-1.5">
                          Groq AI Intent Analysis:
                        </span>
                        <span className="text-slate-300 leading-relaxed">
                          {lead.reasoning}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Multi-Format Pitch Switcher Box */}
                  <div className="mb-4 bg-[#0a0f1d] border border-slate-800 rounded-lg p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2 pb-2 border-b border-slate-800/60">
                      {/* Pitch Format Tabs */}
                      <div className="flex items-center gap-1 text-[11px]">
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedPitchTabs((prev) => ({ ...prev, [lead.id]: "valuePitch" }))
                          }
                          className={`px-2.5 py-1 rounded font-medium transition ${
                            activePitchTab === "valuePitch"
                              ? "bg-indigo-600 text-white"
                              : "text-slate-400 hover:text-white bg-slate-900"
                          }`}
                        >
                          💬 Value Pitch (Comment)
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedPitchTabs((prev) => ({ ...prev, [lead.id]: "quickHook" }))
                          }
                          className={`px-2.5 py-1 rounded font-medium transition ${
                            activePitchTab === "quickHook"
                              ? "bg-sky-600 text-white"
                              : "text-slate-400 hover:text-white bg-slate-900"
                          }`}
                        >
                          🐦 X Hook (&lt;280 chars)
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedPitchTabs((prev) => ({ ...prev, [lead.id]: "directMessage" }))
                          }
                          className={`px-2.5 py-1 rounded font-medium transition ${
                            activePitchTab === "directMessage"
                              ? "bg-purple-600 text-white"
                              : "text-slate-400 hover:text-white bg-slate-900"
                          }`}
                        >
                          ✉️ InMail / DM Sequence
                        </button>
                      </div>

                      {editingReplies[lead.id] !== undefined &&
                        editingReplies[lead.id] !== currentPitchText && (
                          <button
                            onClick={() => saveEditedReply(lead.id)}
                            disabled={savingReplyId === lead.id}
                            className="text-xs font-semibold text-emerald-400 hover:text-emerald-300"
                          >
                            {savingReplyId === lead.id ? "Saving..." : "💾 Save Changes"}
                          </button>
                        )}
                    </div>

                    <textarea
                      rows={3}
                      value={currentPitchText}
                      onChange={(e) =>
                        setEditingReplies((prev) => ({
                          ...prev,
                          [lead.id]: e.target.value,
                        }))
                      }
                      className="w-full bg-transparent border-0 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none resize-y leading-relaxed font-sans"
                      placeholder="Suggested pitch generated by Groq..."
                    />
                  </div>

                  {/* Actions Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/80">
                    {/* Primary CTA: Copy & Open Thread */}
                    <button
                      onClick={() => handleCopyAndOpenThread(lead)}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-glow transition transform active:scale-95"
                    >
                      {copiedId === lead.id ? (
                        <>
                          <Check className="w-4 h-4 text-emerald-300" />
                          <span>Copied &amp; Thread Opened!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          <span>Copy &amp; Open Thread</span>
                          <ExternalLink className="w-3.5 h-3.5 opacity-70" />
                        </>
                      )}
                    </button>

                    {/* Secondary Actions */}
                    <div className="flex items-center gap-2 text-xs">
                      {lead.status === "NEW" && (
                        <>
                          <button
                            onClick={() => updateLead(lead.id, { status: "CONTACTED" })}
                            className="px-2.5 py-1.5 rounded-lg border border-cyan-800/60 bg-cyan-950/30 hover:bg-cyan-900/50 text-cyan-300 transition"
                            title="Mark as Contacted"
                          >
                            Contacted
                          </button>
                          <button
                            onClick={() => updateLead(lead.id, { status: "REPLIED" })}
                            className="px-2.5 py-1.5 rounded-lg border border-emerald-800/60 bg-emerald-950/30 hover:bg-emerald-900/50 text-emerald-300 transition"
                            title="Mark as Replied"
                          >
                            Replied
                          </button>
                        </>
                      )}
                      {lead.status === "CONTACTED" && (
                        <>
                          <button
                            onClick={() => updateLead(lead.id, { status: "REPLIED" })}
                            className="px-2.5 py-1.5 rounded-lg border border-emerald-800/60 bg-emerald-950/30 hover:bg-emerald-900/50 text-emerald-300 transition"
                            title="Mark as Replied"
                          >
                            Mark Replied
                          </button>
                          <button
                            onClick={() => updateLead(lead.id, { status: "NEW" })}
                            className="px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800/50 hover:bg-slate-800 text-slate-300 hover:text-white transition"
                            title="Reset to New"
                          >
                            Mark New
                          </button>
                        </>
                      )}
                      {lead.status === "REPLIED" && (
                        <button
                          onClick={() => updateLead(lead.id, { status: "NEW" })}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800/50 hover:bg-slate-800 text-slate-300 hover:text-white transition"
                          title="Reset to New"
                        >
                          Mark New
                        </button>
                      )}

                      {lead.status !== "ARCHIVED" ? (
                        <button
                          onClick={() => updateLead(lead.id, { status: "ARCHIVED" })}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700 transition"
                          title="Archive lead"
                        >
                          <Archive className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <button
                          onClick={() => updateLead(lead.id, { status: "NEW" })}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700 transition"
                          title="Restore lead"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      )}

                      <button
                        onClick={() => deleteLead(lead.id)}
                        className="px-2 py-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition"
                        title="Delete lead"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </section>
      </main>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 border border-slate-700 text-slate-100 px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 text-xs sm:text-sm animate-bounce">
          <Sparkles className="w-4 h-4 text-indigo-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Multi-Channel Lead Discovery Radar Modal */}
      {showRadarModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative">
            <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
              <Compass className="w-5 h-5 text-indigo-400 animate-spin" />
              <span>Multi-Channel Social Radar</span>
            </h3>
            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
              Scan high-intent discussions across <strong>LinkedIn</strong>, <strong>X (Twitter)</strong>, <strong>Upwork</strong>, <strong>Instagram</strong>, and <strong>Reddit</strong>. Groq AI evaluates commercial urgency, budgets, and pre-drafts 3 pitch variations.
            </p>

            <form onSubmit={handleRunSocialRadar} className="space-y-4 text-xs">
              {/* Select Platform */}
              <div>
                <label className="block text-slate-400 font-semibold mb-1.5 uppercase tracking-wider text-[11px]">
                  Target Channel
                </label>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {[
                    { id: "ALL", label: "All Channels", icon: "🌐" },
                    { id: "LinkedIn", label: "LinkedIn", icon: "💼" },
                    { id: "Twitter", label: "X / Twitter", icon: "𝕏" },
                    { id: "Upwork", label: "Upwork", icon: "🟢" },
                    { id: "Instagram", label: "Instagram", icon: "📸" },
                    { id: "Reddit", label: "Reddit", icon: "🔴" },
                  ].map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setRadarPlatform(p.id as any)}
                      className={`p-2 rounded-lg border text-center transition ${
                        radarPlatform === p.id
                          ? "bg-indigo-600/30 border-indigo-500 text-white font-semibold shadow-glow"
                          : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
                      }`}
                    >
                      <div className="text-sm mb-0.5">{p.icon}</div>
                      <div className="text-[11px] truncate">{p.label}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Keyword / Topic */}
              <div>
                <label className="block text-slate-400 font-semibold mb-1 uppercase tracking-wider text-[11px]">
                  Target Keyword or Buying Trigger
                </label>
                <input
                  type="text"
                  placeholder="e.g. automations, python, backend engr, Next.js developer..."
                  value={radarKeyword}
                  onChange={(e) => setRadarKeyword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Quick Preset Pills */}
              <div>
                <label className="block text-slate-500 text-[10px] mb-1.5">
                  Quick Select Topics:
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    "automations",
                    "python",
                    "backend engr",
                    "backend engineer",
                    "python automation",
                    "Next.js developer",
                    "CRM alternative",
                    "Hiring marketing agency",
                    "UI/UX designer budget",
                    "Full-stack MVP sprint",
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setRadarKeyword(preset)}
                      className="px-2 py-0.5 rounded-full bg-slate-950 border border-slate-800 hover:border-indigo-500 text-[10px] text-slate-300 transition"
                    >
                      + {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Strict Recency & Feed Integrity Notice */}
              <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800 text-[11px] space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sky-400 font-semibold flex items-center gap-1">
                    <span>⚡ Strict Recency &amp; Permalinks Active</span>
                  </span>
                  <a
                    href={buildXSearchQueryUrl(radarKeyword || "automations")}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-sky-400 hover:text-sky-300 hover:underline inline-flex items-center gap-1 font-medium"
                    title="Opens live X feed filtered to recent posts sorted in reverse chronological order"
                  >
                    <span>View X Live Feed (&amp;f=live)</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
                <p className="text-slate-400 text-[10px] leading-relaxed">
                  Appends <code className="text-sky-300 font-mono">&amp;f=live</code> and a dynamic filter (<code className="text-sky-300 font-mono">since:YYYY-MM-DD</code>) for Twitter/X. Validates LinkedIn content search feeds, Upwork jobs, and Instagram tags with direct live URLs.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800/80">
                <button
                  type="button"
                  onClick={() => setShowRadarModal(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={radarScanning}
                  className="px-4 py-2 rounded-lg font-bold bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-glow transition disabled:opacity-50 flex items-center gap-1.5"
                >
                  {radarScanning ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Scanning &amp; Scoring with AI...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Run Discovery Scan</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manual Ingest Modal */}
      {showIngestModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative">
            <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
              <Zap className="w-5 h-5 text-indigo-400" />
              <span>Capture &amp; Analyze Lead</span>
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Paste any social thread URL and content. Groq Llama-3.1-8b-instant will score buying intent and draft multi-format pitches.
            </p>

            <form onSubmit={handleIngestSubmit} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Source</label>
                  <select
                    value={ingestForm.source}
                    onChange={(e) => setIngestForm({ ...ingestForm, source: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200"
                  >
                    <option value="LinkedIn">LinkedIn</option>
                    <option value="Twitter">Twitter / X</option>
                    <option value="Upwork">Upwork</option>
                    <option value="Instagram">Instagram</option>
                    <option value="Reddit">Reddit</option>
                    <option value="ChromeExtension">Chrome Extension</option>
                    <option value="F5Bot">F5Bot</option>
                    <option value="RSS">RSS</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Author</label>
                  <input
                    type="text"
                    placeholder="e.g. Sarah Jenkins or @alex_builds"
                    value={ingestForm.author}
                    onChange={(e) => setIngestForm({ ...ingestForm, author: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Post / Thread Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Looking for Next.js developer to build MVP..."
                  value={ingestForm.title}
                  onChange={(e) => setIngestForm({ ...ingestForm, title: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Post URL</label>
                <input
                  type="url"
                  required
                  placeholder="https://linkedin.com/posts/... or https://x.com/..."
                  value={ingestForm.url}
                  onChange={(e) => setIngestForm({ ...ingestForm, url: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  LinkedIn URLs must be direct permalinks (/posts/, /feed/update/, or /pulse/). Search feeds (/search/results/) are rejected.
                </p>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Post Body Content</label>
                <textarea
                  rows={4}
                  required
                  placeholder="Paste the post text here..."
                  value={ingestForm.content}
                  onChange={(e) => setIngestForm({ ...ingestForm, content: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowIngestModal(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={ingesting}
                  className="px-4 py-2 rounded-lg font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-glow transition disabled:opacity-50"
                >
                  {ingesting ? "Analyzing with Groq..." : "⚡ Analyze & Ingest"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Chrome Extension Modal */}
      {showExtensionModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
              <Puzzle className="w-5 h-5 text-indigo-400" />
              <span>Manifest V3 Chrome Extension</span>
            </h3>
            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
              The Chrome Extension supports 1-click capture from <strong>Reddit</strong>, <strong>LinkedIn</strong>, and <strong>X (Twitter)</strong>, and injects 1-click &quot;✨ Insert AI Reply&quot; buttons right into active comment/tweet input boxes!
            </p>

            <div className="space-y-3 text-xs bg-slate-950 p-4 rounded-xl border border-slate-800 text-slate-300">
              <div className="flex items-start gap-2">
                <span className="font-bold text-indigo-400">1.</span>
                <span>Open Google Chrome and navigate to <code className="bg-slate-800 px-1 py-0.5 rounded text-indigo-300">chrome://extensions</code></span>
              </div>
              <div className="flex items-start gap-2">
                <span className="font-bold text-indigo-400">2.</span>
                <span>Toggle ON <strong>&quot;Developer mode&quot;</strong> in the top-right corner.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="font-bold text-indigo-400">3.</span>
                <span>Click <strong>&quot;Load unpacked&quot;</strong> and select the directory:</span>
              </div>
              <div className="p-2 bg-slate-900 rounded font-mono text-[11px] text-slate-200 border border-slate-800 select-all">
                C:\Users\Joshua\Desktop\LeadGen\extension
              </div>
              <div className="flex items-start gap-2">
                <span className="font-bold text-indigo-400">4.</span>
                <span>Click the puzzle icon in Chrome to pin <strong>LeadPulse AI</strong>!</span>
              </div>
            </div>

            <div className="flex justify-end mt-4">
              <button
                onClick={() => setShowExtensionModal(false)}
                className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Monitored Keywords Modal */}
      {showKeywordsModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
              <Tag className="w-5 h-5 text-indigo-400" />
              <span>Monitored Keywords</span>
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Social radar and RSS feeds automatically monitor and qualify leads containing these keywords.
            </p>

            <form onSubmit={handleAddKeyword} className="flex gap-2 mb-4">
              <input
                type="text"
                placeholder="e.g. looking for agency, hire developer..."
                value={newKeywordInput}
                onChange={(e) => setNewKeywordInput(e.target.value)}
                className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="submit"
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg"
              >
                Add
              </button>
            </form>

            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {keywords.map((kw) => (
                <div
                  key={kw.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-slate-950 border border-slate-800/80 text-xs"
                >
                  <span className="text-slate-200 font-medium">{kw.keyword}</span>
                  <button
                    onClick={() => handleDeleteKeyword(kw.id)}
                    className="text-slate-500 hover:text-rose-400 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex justify-end mt-4">
              <button
                onClick={() => setShowKeywordsModal(false)}
                className="px-4 py-1.5 rounded-lg border border-slate-800 text-slate-300 text-xs hover:text-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
