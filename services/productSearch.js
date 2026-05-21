import pool from "../db/db.js";

const STOP_WORDS = [
  "추천", "해줘", "좋은", "제품", "상품", "알려줘",
  "먹는", "섭취", "관리", "건강", "영양제"
];

function extractKeywords(message) {
  return message
    .replace(/[^\w가-힣\s]/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 2)
    .filter((word) => !STOP_WORDS.includes(word));
}

export async function searchProducts(message) {
  const keywords = extractKeywords(message);

  if (keywords.length === 0) {
    return [];
  }

  const patterns = keywords.map((keyword) => `%${keyword}%`);

  const result = await pool.query(
    `
    SELECT
      goods_no,
      goods_name,
      goods_search_word,
      goods_price,
      fixed_price,
      image_url,
      short_description,
      order_cnt,
      hit_cnt,

      (
        CASE
          WHEN goods_name ILIKE ANY($1) THEN 100
          ELSE 0
        END
        +
        CASE
          WHEN goods_search_word ILIKE ANY($1) THEN 50
          ELSE 0
        END
        +
        CASE
          WHEN short_description ILIKE ANY($1) THEN 30
          ELSE 0
        END
      ) AS relevance_score

    FROM chatbot_products
    WHERE is_active = true
      AND (
        goods_name ILIKE ANY($1)
        OR goods_search_word ILIKE ANY($1)
        OR short_description ILIKE ANY($1)
      )
    ORDER BY relevance_score DESC, order_cnt DESC, hit_cnt DESC
    LIMIT 5
    `,
    [patterns]
  );

  return result.rows;
}