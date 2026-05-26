import pool from "../db/db.js";

function extractKeywords(message) {
  return message
    .replace(/[^\w가-힣\s]/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 2);
}

export async function searchFaqs(message, goodsNos = []) {
  const keywords = extractKeywords(message);

  if (keywords.length === 0 && goodsNos.length === 0) {
    return [];
  }

  const patterns = keywords.map((keyword) => `%${keyword}%`);

  const result = await pool.query(
    `
    SELECT
      id,
      source_sno,
      goods_no,
      category,
      question,
      answer,
      keywords,
      is_best,
      sort_no
    FROM chatbot_faqs
    WHERE is_active = true
      AND (
        goods_no = ANY($1)
        OR question ILIKE ANY($2)
        OR answer ILIKE ANY($2)
        OR keywords ILIKE ANY($2)
      )
    ORDER BY
      CASE WHEN goods_no = ANY($1) THEN 100 ELSE 0 END DESC,
      CASE WHEN is_best = true THEN 30 ELSE 0 END DESC,
      sort_no ASC NULLS LAST,
      source_mod_dt DESC NULLS LAST
    LIMIT 5
    `,
    [goodsNos, patterns.length > 0 ? patterns : ["%%"]]
  );

  return result.rows;
}