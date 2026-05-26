import dotenv from "dotenv";
import axios from "axios";
import pool from "../db/db.js";

dotenv.config();

function normalizeText(text) {
  return String(text || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\\r|\\n|\\t/g, " ")
    .replace(/\r|\n|\t/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function syncFaqs() {
  console.log("FAQ 동기화 시작");

  try {
    const response = await axios.get(
      "https://shopagh.com/api/chatgpt/faqs",
      {
        headers: {
          "X-CHATBOT-KEY": process.env.CHATBOT_SECRET_KEY
        },
        timeout: 60000
      }
    );

    if (!response.data || response.data.success !== true) {
      console.error("고도몰 FAQ API 응답:", response.data);
      throw new Error("고도몰 FAQ API 응답 실패");
    }

    const items = response.data.items || [];

    console.log(`조회 FAQ 수: ${items.length}`);

    await pool.query(`
      UPDATE chatbot_faqs
      SET is_active = false
    `);

    for (const item of items) {
      const question = normalizeText(item.question);
      const answer = normalizeText(item.answer);
      const keywords = normalizeText(item.keywords);

      if (!question || !answer) {
        continue;
      }

      await pool.query(
        `
        INSERT INTO chatbot_faqs (
          source_sno,
          goods_no,
          category,
          question,
          answer,
          keywords,
          is_best,
          sort_no,
          is_active,
          source_reg_dt,
          source_mod_dt,
          synced_at
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,
          false,NULL,true,
          $7,$8,NOW()
        )
        ON CONFLICT (source_sno)
        DO UPDATE SET
          goods_no = EXCLUDED.goods_no,
          category = EXCLUDED.category,
          question = EXCLUDED.question,
          answer = EXCLUDED.answer,
          keywords = EXCLUDED.keywords,
          is_active = true,
          source_reg_dt = EXCLUDED.source_reg_dt,
          source_mod_dt = EXCLUDED.source_mod_dt,
          synced_at = NOW()
        `,
        [
          item.sourceSno,
          item.goodsNo || null,
          item.category || "",
          question,
          answer,
          keywords,
          item.regDt || null,
          item.modDt || null
        ]
      );
    }

    console.log("FAQ 동기화 완료");
  } catch (error) {
    console.error("FAQ 동기화 실패");
    console.error(error.message);
  } finally {
    await pool.end();
  }
}

syncFaqs();