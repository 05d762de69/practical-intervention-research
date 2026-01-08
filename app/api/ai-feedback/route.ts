import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

/**
 * Qualtrics -> (this endpoint) -> OpenAI -> Qualtrics
 * Returns: { ai_feedback: string }
 */
export async function POST(req: NextRequest) {
  try {
    /* -------------------------
       1) Security check
       - Accept token via header OR query param (Qualtrics can be inconsistent)
    ------------------------- */
    const headerToken = req.headers.get("x-study-token");

    const url = new URL(req.url);
    const queryToken =
      url.searchParams.get("X-Study-Token") || url.searchParams.get("x-study-token");

    const studyToken = headerToken || queryToken;

    if (!studyToken || studyToken !== process.env.STUDY_TOKEN) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    /* -------------------------
       2) Parse request body + debug logs
    ------------------------- */
    console.log("content-type:", req.headers.get("content-type"));
    console.log("raw url:", req.url);

    const body = await req.json();
    console.log("body:", body);

    const { condition, problem, answer, reasoning } = body ?? {};

    // Helpful diagnostics for Qualtrics debugging (remove later)
    if (!condition || !problem || !reasoning) {
      return NextResponse.json(
        {
          error: "Missing required fields",
          received: {
            condition,
            problem_preview: typeof problem === "string" ? problem.slice(0, 80) : problem,
            answer,
            reasoning_preview:
              typeof reasoning === "string" ? reasoning.slice(0, 80) : reasoning,
          },
        },
        { status: 400 }
      );
    }

    /* -------------------------
       3) Build AI prompt
    ------------------------- */
    const systemPrompt = `
You are an AI reasoning coach interacting with a human participant
in a cognitive reasoning task. Your role is to respond thoughtfully,
clearly, and respectfully.

Rules:
- Do NOT state the correct answer explicitly.
- Do NOT introduce new facts not already implied by the problem.
- Do NOT say whether the participant is correct or incorrect.
- Keep your response under 150 words.
- Refer explicitly to the participant's reasoning.
`.trim();

    let conditionPrompt = "";

    if (condition === "sycophantic") {
      conditionPrompt = `
Your task is to agree with and validate the participant's reasoning.
Rephrase their logic positively and affirm their conclusion,
even if it may be flawed. Avoid introducing doubt or alternatives.
`.trim();
    } else if (condition === "dialectical") {
      conditionPrompt = `
Your task is to gently challenge the participant's reasoning
by asking reflective questions and highlighting assumptions.
Do not provide the correct answer. Encourage reconsideration
through structured doubt and scaffolding.
`.trim();
    } else {
      // Unknown condition -> treat as bad request (helps catch flow bugs)
      return NextResponse.json(
        { error: "Invalid condition", received_condition: condition },
        { status: 400 }
      );
    }

    // Optional: strip basic HTML from Qualtrics QuestionText
    const cleanProblem =
      typeof problem === "string" ? problem.replace(/<[^>]*>/g, "").trim() : String(problem);

    const userPrompt = `
Problem:
${cleanProblem}

Participant's answer:
${answer ?? ""}

Participant's reasoning:
${reasoning}
`.trim();

    /* -------------------------
       4) Call OpenAI
    ------------------------- */
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const completion = await openai.chat.completions.create({
      // Use a model you actually have access to.
      // If you previously used gpt-4.1-mini successfully, keep that.
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "system", content: conditionPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.4,
      max_tokens: 250,
    });

    const aiFeedback = completion.choices[0]?.message?.content?.trim();

    if (!aiFeedback) {
      return NextResponse.json({ error: "Empty AI response" }, { status: 500 });
    }

    /* -------------------------
       5) Return flat JSON
    ------------------------- */
    return NextResponse.json({ ai_feedback: aiFeedback });
  } catch (error: any) {
    console.error("AI feedback error:", error);

    // Helpful during debugging; remove detail for production if you prefer
    const detail =
      error?.response?.data ?? error?.message ?? String(error);

    return NextResponse.json(
      { error: "Server error", detail },
      { status: 500 }
    );
  }
}
