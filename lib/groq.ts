import Groq from "groq-sdk";
import { cleanLeadText } from "@/lib/cleaner";

export interface PitchVariants {
  valuePitch: string;      // Consultative, authentic, community/post reply
  quickHook: string;       // Short, punchy (<280 chars) for X / Twitter
  directMessage: string;   // High-converting 3-sentence DM / LinkedIn InMail
}

export interface IntentSignals {
  urgency: "IMMEDIATE" | "HIGH" | "MEDIUM" | "EXPLORATORY";
  budgetEstimate: string;  // e.g. "$500 - $1,500", "$95/hr", "Flexible", "Unspecified"
  decisionMakerRole: string; // e.g. "Founder / CEO", "CTO / Tech Lead", "Marketing Lead", "Agency / Client"
  keyPainPoint: string;
  positiveTriggers: string[];
  negativeTriggers: string[];
}

export interface AnalyzeLeadResult {
  intentScore: number;
  reasoning: string;
  suggestedReply: string;
  pitches?: PitchVariants;
  signals?: IntentSignals;
}

export interface AnalyzeLeadInput {
  title?: string | null;
  content: string;
  source?: string;
  author?: string | null;
}

const groqApiKey = process.env.GROQ_API_KEY;

// Refined heuristic algorithm for lead intent scoring & multi-platform pitch generation
function fallbackHeuristicAnalysis(
  title: string,
  content: string,
  source?: string
): AnalyzeLeadResult {
  const sanitizedTitle = cleanLeadText(title || "");
  const sanitizedContent = cleanLeadText(content || "");
  const combined = `${sanitizedTitle} ${sanitizedContent}`.toLowerCase();
  const cleanTitle = (sanitizedTitle || "your project").replace(/\[.*?\]/g, "").trim();

  // 1. Urgency Signals (Weight: 25%)
  const immediateUrgencyKeywords = [
    "urgent", "asap", "immediately", "this week", "today", "emergency", "broken",
    "deadline", "need now", "right away", "critical", "blocking", "ready to hire"
  ];
  const moderateUrgencyKeywords = [
    "soon", "next sprint", "looking to start", "in the coming weeks", "next month", "planning"
  ];

  let urgencyScore = 10;
  let detectedUrgency: "IMMEDIATE" | "HIGH" | "MEDIUM" | "EXPLORATORY" = "EXPLORATORY";

  for (const kw of immediateUrgencyKeywords) {
    if (combined.includes(kw)) {
      urgencyScore = 25;
      detectedUrgency = "IMMEDIATE";
      break;
    }
  }
  if (urgencyScore < 25) {
    for (const kw of moderateUrgencyKeywords) {
      if (combined.includes(kw)) {
        urgencyScore = 18;
        detectedUrgency = "HIGH";
        break;
      }
    }
  }
  if (urgencyScore === 10 && (combined.includes("looking for") || combined.includes("need"))) {
    urgencyScore = 14;
    detectedUrgency = "MEDIUM";
  }

  // 2. Budget & Commercial Signals (Weight: 30%)
  let budgetScore = 10;
  let budgetEstimate = "Unspecified";
  const positiveTriggers: string[] = [];

  // Match explicit hourly rate, fixed dollar amounts, or $Xk notation (e.g. $5k, $5,000, $95/hr)
  const budgetMatch = combined.match(/\$([0-9,]+(?:\.[0-9]{2})?\s*[kmb]?)\s*(?:-|to)?\s*(?:\$([0-9,]+(?:\.[0-9]{2})?\s*[kmb]?))?(?:\s*\/(?:hr|hour|mo|month|wk|week|day|project))?/i);
  if (budgetMatch) {
    budgetScore = 30;
    budgetEstimate = budgetMatch[0].trim();
    positiveTriggers.push(`Explicit budget: ${budgetEstimate}`);
  } else if (
    combined.includes("paid") ||
    combined.includes("budget") ||
    combined.includes("rates") ||
    combined.includes("pricing") ||
    combined.includes("quote") ||
    combined.includes("contract")
  ) {
    budgetScore = 24;
    budgetEstimate = "Flexible / Commercial";
    positiveTriggers.push("Commercial budget indicator");
  } else if (
    combined.includes("switch from") ||
    combined.includes("alternative to") ||
    combined.includes("replacing") ||
    combined.includes("tired of") ||
    combined.includes("frustrated with")
  ) {
    budgetScore = 25;
    budgetEstimate = "Active Tool Migration";
    positiveTriggers.push("Tool churn / migration trigger");
  }

  // 3. Authority & Role Signals (Weight: 25%)
  let authorityScore = 10;
  let decisionMakerRole = "Prospect / User";

  if (
    combined.includes("founder") ||
    combined.includes("co-founder") ||
    combined.includes("my startup") ||
    combined.includes("ceo") ||
    combined.includes("owner")
  ) {
    authorityScore = 25;
    decisionMakerRole = "Founder / CEO";
    positiveTriggers.push("Executive decision-maker (Founder/CEO)");
  } else if (
    combined.includes("cto") ||
    combined.includes("tech lead") ||
    combined.includes("engineering lead") ||
    combined.includes("vp engineering")
  ) {
    authorityScore = 23;
    decisionMakerRole = "CTO / Tech Lead";
    positiveTriggers.push("Technical decision-maker (CTO/Lead)");
  } else if (
    combined.includes("marketing director") ||
    combined.includes("head of growth") ||
    combined.includes("product manager")
  ) {
    authorityScore = 22;
    decisionMakerRole = "Head of Product / Growth";
    positiveTriggers.push("Functional departmental lead");
  } else if (
    combined.includes("we are hiring") ||
    combined.includes("our team") ||
    combined.includes("we are looking") ||
    combined.includes("looking for an agency") ||
    combined.includes("looking for a developer")
  ) {
    authorityScore = 22;
    decisionMakerRole = "Hiring Client / Business";
    positiveTriggers.push("Active hiring client / business");
  }

  // Check if client is requesting applicant portfolios (buyer signal)
  if (
    combined.includes("with portfolio") ||
    combined.includes("send portfolio") ||
    combined.includes("dm portfolio") ||
    combined.includes("your portfolio") ||
    combined.includes("portfolio required")
  ) {
    authorityScore = Math.max(authorityScore, 22);
    positiveTriggers.push("Buyer actively requesting vendor portfolios");
  }

  // 4. Actionability & Problem Clarity (Weight: 20%)
  let actionabilityScore = 12;
  const hiringKeywords = [
    "hire", "hiring", "looking for developer", "need developer", "need designer",
    "recommend me", "anyone know a", "looking for an agency", "seeking a partner",
    "can someone build", "bounty", "looking for a tool", "redesign our"
  ];
  for (const kw of hiringKeywords) {
    if (combined.includes(kw)) {
      actionabilityScore = 20;
      positiveTriggers.push(`High-action trigger: "${kw}"`);
      break;
    }
  }

  // Technical domain triggers (automations, python, backend engr)
  const technicalKeywords = [
    "automations", "automation", "python", "backend engr", "backend engineer",
    "fastapi", "django", "flask", "n8n", "make.com", "zapier", "web scraping",
    "etl", "rest api", "postgresql", "microservices"
  ];
  for (const tkw of technicalKeywords) {
    if (combined.includes(tkw)) {
      positiveTriggers.push(`Technical requirement: "${tkw}"`);
      authorityScore = Math.max(authorityScore, 22);
      actionabilityScore = Math.max(actionabilityScore, 18);
    }
  }

  // 5. Negative Penalties (-25 to -60%) - Only genuine candidate / seller posts
  let penalty = 0;
  const negativeTriggers: string[] = [];

  const isSellerPortfolio =
    combined.includes("my portfolio") ||
    combined.includes("check out my portfolio") ||
    combined.includes("here is my portfolio") ||
    combined.includes("view my portfolio") ||
    combined.includes("i am offering") ||
    combined.includes("hire me") ||
    combined.includes("looking for a job") ||
    combined.includes("open for work") ||
    combined.includes("open to work");

  const isForHireTag =
    (combined.includes("[for hire]") || combined.startsWith("for hire")) &&
    !combined.includes("looking for") &&
    !combined.includes("hiring");

  if (isSellerPortfolio || isForHireTag) {
    penalty += 40;
    negativeTriggers.push("Freelancer advertisement / job seeker offering services");
    decisionMakerRole = "Freelancer (Seller) / Job Seeker";
  }

  const lowIntentKeywords = ["student", "homework", "free only", "no budget", "tutorial", "meme"];
  for (const kw of lowIntentKeywords) {
    if (combined.includes(kw)) {
      penalty += 30;
      negativeTriggers.push(`Low-intent indicator: "${kw}"`);
    }
  }

  // Compute composite score (0-100)
  let rawScore = urgencyScore + budgetScore + authorityScore + actionabilityScore - penalty;
  const intentScore = Math.max(5, Math.min(98, Math.round(rawScore)));

  // Extract pain point summary
  let keyPainPoint = cleanTitle || "Looking for a specialized solution or developer";
  if (combined.includes("alternative to")) {
    const afterAlt = combined.split("alternative to")[1]?.slice(0, 40).trim();
    if (afterAlt) keyPainPoint = `Finding an alternative to ${afterAlt}`;
  } else if (combined.includes("looking for")) {
    const afterLooking = combined.split("looking for")[1]?.slice(0, 45).trim();
    if (afterLooking) keyPainPoint = `Looking for ${afterLooking}`;
  }

  // Synthesize reasoning
  let reasoning = "";
  if (intentScore >= 70) {
    reasoning = `High commercial intent detected (${intentScore}/100). Urgency: ${detectedUrgency}, Role: ${decisionMakerRole}, Budget: ${budgetEstimate}. Key signals: ${positiveTriggers.slice(0, 2).join(", ") || "Active project requirements"}.`;
  } else if (intentScore >= 40) {
    reasoning = `Moderate intent (${intentScore}/100). The author outlines a real workflow or challenge (${decisionMakerRole}) with ${detectedUrgency.toLowerCase()} urgency. Good opportunity for consultative positioning.`;
  } else {
    reasoning = `Low buyer intent (${intentScore}/100). ${negativeTriggers.length > 0 ? `Anti-signal detected: ${negativeTriggers.join(", ")}.` : "Informational discussion or general community comment."}`;
  }

  // Generate 3 multi-platform pitches
  const pitches: PitchVariants = {
    // 1. Value Pitch (Consultative for Reddit / LinkedIn comments)
    valuePitch: `Hey! Saw your post regarding ${cleanTitle || "this requirement"}. We've tackled similar challenges recently where we helped streamline the implementation with zero friction. Happy to share a quick 2-minute breakdown or demo of how we solve this if helpful—feel free to shoot me a DM!`,

    // 2. Quick Hook (Optimized for X / Twitter <280 chars)
    quickHook: `We solved this exact challenge for a team last month—happy to send over our quick architecture breakdown if you're still comparing options! Sent you a DM 🚀`,

    // 3. Direct Message / InMail (High-converting 3-sentence DM sequence / Upwork Proposal)
    directMessage: `Hi there, saw your post about ${cleanTitle || "your project"} and wanted to reach out directly. We specialize in exactly this stack and recently delivered a similar solution with great ROI. Are you free for a quick chat this week to see if there's a fit?`
  };

  // Determine primary suggested reply based on source
  let suggestedReply = pitches.valuePitch;
  const src = source?.toLowerCase() || "";
  if (src === "twitter" || src === "x") {
    suggestedReply = pitches.quickHook;
  } else if (src === "linkedin") {
    suggestedReply = pitches.valuePitch;
  } else if (src === "upwork") {
    suggestedReply = pitches.directMessage || pitches.valuePitch;
  } else if (src === "instagram") {
    suggestedReply = pitches.quickHook || pitches.valuePitch;
  }

  return {
    intentScore,
    reasoning,
    suggestedReply,
    pitches,
    signals: {
      urgency: detectedUrgency,
      budgetEstimate,
      decisionMakerRole,
      keyPainPoint,
      positiveTriggers,
      negativeTriggers
    }
  };
}

export async function analyzeLeadWithGroq({
  title,
  content,
  source,
  author,
}: AnalyzeLeadInput): Promise<AnalyzeLeadResult> {
  const postTitle = cleanLeadText(title || "");
  const postContent = cleanLeadText(content || "");
  const postSource = source || "Reddit";

  if (!groqApiKey || groqApiKey === "gsk_your_groq_api_key_here") {
    console.warn("[Groq AI] GROQ_API_KEY is not set. Using refined multi-factor heuristic analyzer.");
    return fallbackHeuristicAnalysis(postTitle, postContent, postSource);
  }

  try {
    const groq = new Groq({ apiKey: groqApiKey });

    const systemPrompt = `You are an elite B2B social listening, intent intelligence, and deal qualification AI.
Analyze incoming social posts, job postings, forum inquiries, or messages from Reddit, LinkedIn, X (Twitter), Upwork, and Instagram to assess commercial buyer intent. Special focus on requirements like software development, workflow automations, Python, and backend engineering.

EVALUATION CRITERIA:
1. Urgency (0-25 pts): Immediate need/deadline/broken vs vague roadmap.
2. Budget & Commercial Viability (0-30 pts): Stated budget ($), tool replacement churn, willingness to pay, paid hiring vs free/student.
3. Decision-Maker Authority (0-25 pts): Founder, CEO, CTO, Head of Product, Team Lead vs student, intern, employee.
4. Problem Specificity & Actionability (0-20 pts): Concrete scope and clear deliverables.
5. Negative Signal Penalties (-20 to -60 pts): Candidates seeking work ([For Hire]), job hunters, self-promoters, tutors, spam.

OUTPUT THREE PITCH FORMATS:
1. "valuePitch": 2-3 sentence consultative, authentic, non-salesy reply for public comments.
2. "quickHook": Punchy, high-engagement hook for X/Twitter strictly under 280 characters.
3. "directMessage": High-converting 3-sentence DM sequence / Upwork proposal (Hook -> Proof -> Low-friction CTA).

STRICT JSON ONLY (no markdown fences, no explanation):
{
  "intentScore": <integer 0-100>,
  "reasoning": "<concise 1-2 sentence breakdown citing urgency, authority, and commercial signals>",
  "suggestedReply": "<primary tailored response>",
  "pitches": {
    "valuePitch": "<public consultative comment>",
    "quickHook": "<under 280 chars twitter hook>",
    "directMessage": "<3-sentence direct message template>"
  },
  "signals": {
    "urgency": "IMMEDIATE" | "HIGH" | "MEDIUM" | "EXPLORATORY",
    "budgetEstimate": "<e.g. '$500 - $1,000', '$95/hr', 'Flexible', or 'Unspecified'>",
    "decisionMakerRole": "<e.g. 'Founder / CEO', 'CTO / Tech Lead', 'Head of Growth', 'Buyer'>",
    "keyPainPoint": "<concise 1-sentence problem statement>"
  }
}`;

    const userPrompt = `Source: ${postSource}\nAuthor: ${author || "Anonymous"}\nTitle: ${postTitle || "N/A"}\n\nContent:\n${postContent}`;

    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.25,
      response_format: { type: "json_object" },
    });

    const responseContent = completion.choices[0]?.message?.content?.trim() || "";

    const cleanedJson = responseContent
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/, "")
      .replace(/```\s*$/, "")
      .trim();

    const parsed = JSON.parse(cleanedJson);

    const intentScore =
      typeof parsed.intentScore === "number"
        ? Math.max(0, Math.min(100, Math.round(parsed.intentScore)))
        : 50;

    const pitches: PitchVariants = parsed.pitches || {
      valuePitch: parsed.suggestedReply || "Hey! Saw your post and would love to help.",
      quickHook: "We recently solved this exact bottleneck—happy to share our framework if helpful! Sent you a DM.",
      directMessage: "Hi, saw your post and wanted to connect. We specialize in this exact area and would love to share a quick walkthrough if you're exploring options."
    };

    let suggestedReply = parsed.suggestedReply || pitches.valuePitch;
    const ps = postSource.toLowerCase();
    if ((ps === "twitter" || ps === "x") && pitches.quickHook) {
      suggestedReply = pitches.quickHook;
    } else if (ps === "upwork" && pitches.directMessage) {
      suggestedReply = pitches.directMessage;
    } else if (ps === "instagram" && pitches.quickHook) {
      suggestedReply = pitches.quickHook;
    }

    return {
      intentScore,
      reasoning: parsed.reasoning || "Scored with Groq Llama-3.1-8b-instant multi-factor intent intelligence.",
      suggestedReply,
      pitches,
      signals: parsed.signals || {
        urgency: intentScore >= 75 ? "IMMEDIATE" : intentScore >= 50 ? "HIGH" : "MEDIUM",
        budgetEstimate: "Commercial",
        decisionMakerRole: "Decision Maker",
        keyPainPoint: postTitle || "Workflow requirement"
      }
    };
  } catch (error: any) {
    console.error("[Groq AI Error]:", error?.message || error);
    return fallbackHeuristicAnalysis(postTitle, postContent, postSource);
  }
}
