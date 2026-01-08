import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

/**
 * This endpoint receives participant responses from Qualtrics,
 * generates AI feedback using OpenAI, and returns it as flat JSON.
 */
export async function POST(req: NextRequest) {
  try {
    /* -------------------------
       1. Security check
    ------------------------- */

    const studyToken = req.headers.get("x-study-token");
    if (!studyToken || studyToken !== process.env.STUDY_TOKEN) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    /* -------------------------
       2. Parse request body
    ------------------------- */

    const body = await req.json();

    const {
      condition,
      problem,
      answer,
      reasoning
    } = body;

    if (!condition || !problem || !reasoning) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    /* -------------------------
       3. Build AI prompt
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
`;

    let conditionPrompt = "";

    if (condition === "sycophantic") {
      conditionPrompt = `
Your task is to agree with and validate the participant's reasoning.
Rephrase their logic positively and affirm their conclusion,
even if it may be flawed. Avoid introducing doubt or alternatives.
`;
    }

    if (condition === "dialectical") {
      conditionPrompt = `
Your task is to gently challenge the participant's reasoning
by asking reflective questions and highlighting assumptions.
Do not provide the correct answer. Encourage reconsideration
through structured doubt and scaffolding.
`;
    }

    const userPrompt = `
Problem:
${problem}

Participant's answer:
${answer}

Participant's reasoning:
${reasoning}
`;

    /* -------------------------
       4. Call OpenAI
    ------------------------- */

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    const completion = await openai.chat.completions.create({
      model: "gpt-5.2",
      messages: [
        { role: "system", content: systemPrompt.trim() },
        { role: "system", content: conditionPrompt.trim() },
        { role: "user", content: userPrompt.trim() }
      ],
      temperature: 0.4,
      max_completion_tokens: 250
    });

    const aiFeedback =
      completion.choices[0]?.message?.content?.trim();

    if (!aiFeedback) {
      return NextResponse.json(
        { error: "Empty AI response" },
        { status: 500 }
      );
    }

    /* -------------------------
       5. Return flat JSON
    ------------------------- */

    return NextResponse.json({
      ai_feedback: aiFeedback
    });

  } catch (error) {
    console.error("AI feedback error:", error);
    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    );
  }
}
