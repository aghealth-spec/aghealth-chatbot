import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import pool from "./db/db.js";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// system prompt 로드
const systemPrompt = fs.readFileSync(
  path.join(process.cwd(), "prompts", "systemPrompt.txt"),
  "utf-8"
);

// 금지어 필터 로드
const blockedWords = JSON.parse(
  fs.readFileSync(
    path.join(process.cwd(), "filters", "blockedWords.json"),
    "utf-8"
  )
);

function hasBlockedExpression(text) {
  return blockedWords.some((word) => text.includes(word));
}

app.get("/", (req, res) => {
  res.send("AGHealth Chatbot Running");
});

app.post("/chat", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        success: false,
        answer: "질문 내용을 입력해주세요."
      });
    }

    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL,
      input: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: message
        }
      ]
    });

    let answer = response.output_text || "";

    if (hasBlockedExpression(answer)) {
      answer =
        "해당 문의는 개인 건강상태나 질병 관련 판단이 필요할 수 있어 챗봇이 단정적으로 안내드리기 어렵습니다. 정확한 안내를 위해 상담원 또는 전문가 상담을 권장드립니다.";
    }

    res.json({
      success: true,
      answer
    });
  } catch (error) {
    console.error("OPENAI ERROR:", error);

    res.status(500).json({
      success: false,
      answer: "일시적으로 답변을 생성하지 못했습니다. 상담원 연결을 이용해주세요.",
      errorMessage: error.message,
      errorCode: error.code,
      errorType: error.type
    });
  }
});

async function testDB() {

  try {

    const result = await pool.query(
      "SELECT NOW()"
    );

    console.log("PostgreSQL Connected");
    console.log(result.rows);

  } catch (error) {

    console.error("DB CONNECTION ERROR");
    console.error(error);

  }

}

testDB();

app.listen(process.env.PORT || 3001, () => {
  console.log(`Server Running : ${process.env.PORT || 3001}`);
});