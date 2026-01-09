import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";
import OpenAI from "openai";


export async function POST(req: NextRequest) {
  try {

    const headerToken = req.headers.get("x-study-token");

    const url = new URL(req.url);
    const queryToken =
      url.searchParams.get("X-Study-Token") || url.searchParams.get("x-study-token");

    const studyToken = headerToken || queryToken;

    if (!studyToken || studyToken !== process.env.STUDY_TOKEN) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    console.log("content-type:", req.headers.get("content-type"));
    console.log("raw url:", req.url);
    console.log("body:", body);

    let data: any = body;

    if (body && typeof body === "object" && !Array.isArray(body)) {
    const keys = Object.keys(body);
    if (keys.length === 1 && typeof body[keys[0]] === "object") {
        data = body[keys[0]];
    }
    if (keys.length === 1 && typeof body[keys[0]] === "string") {
        try {
        data = JSON.parse(body[keys[0]]);
        } catch {
        // keep as-is
        }
    }
    }

    const { condition, problem, answer, reasoning } = data ?? {};

    if (!condition || !problem || !reasoning) {
    return NextResponse.json(
        {
        error: "Missing required fields",
        debug: {
            condition,
            problem_type: typeof problem,
            problem_preview: typeof problem === "string" ? problem.slice(0, 120) : problem,
            answer_type: typeof answer,
            answer,
            reasoning_type: typeof reasoning,
            reasoning_preview:
            typeof reasoning === "string" ? reasoning.slice(0, 120) : reasoning,
            content_type: req.headers.get("content-type"),
            url: req.url
        }
        },
        { status: 400 }
    );
    }

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

        return NextResponse.json(
        { error: "Invalid condition", received_condition: condition },
        { status: 400 }
      );
    }

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

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const completion = await openai.chat.completions.create({

      model: "gpt-5-mini-2025-08-07",
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

    return NextResponse.json({ ai_feedback: aiFeedback });
  } catch (error: any) {
    console.error("AI feedback error:", error);

    const detail =
      error?.response?.data ?? error?.message ?? String(error);

    return NextResponse.json(
      { error: "Server error", detail },
      { status: 500 }
    );
  }
}
