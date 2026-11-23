
import pool from "../db/db.js";

const STOP_WORDS = [
  "추천",
  "추천해줘",
  "해줘",
  "좋은",
  "제품",
  "상품",
  "알려줘",
  "찾아줘",
  "보여줘",
  "뭐야",
  "어떤",
  "있나요",
  "주세요"
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

  // ILIKE의 %, _, \ 문자를 리터럴로 처리
  const patterns = keywords.map((keyword) => {
    const escaped = keyword.replace(/[\\%_]/g, "\\$&");
    return `%${escaped}%`;
  });

  const result = await pool.query(
    `
    SELECT
      p.goods_no,
      p.goods_name,
      p.goods_search_word,
      p.goods_price,
      p.fixed_price,
      p.image_url,
      p.short_description,
      p.order_cnt,
      p.hit_cnt,
      p.detail_info,
      p.expiration_dt,
      p.product_notice,

      (
        CASE
          WHEN p.goods_name ILIKE ANY($1::text[]) THEN 10
          ELSE 0
        END
        +
        CASE
          WHEN p.detail_info ILIKE ANY($1::text[]) THEN 100
          ELSE 0
        END
        +
        CASE
          WHEN p.short_description ILIKE ANY($1::text[]) THEN 70
          ELSE 0
        END
        +
        CASE
          WHEN p.goods_search_word ILIKE ANY($1::text[]) THEN 80
          ELSE 0
        END
        +
        CASE
          WHEN EXISTS (
            SELECT 1
            FROM jsonb_array_elements(
              CASE
                WHEN jsonb_typeof(p.product_notice) = 'array'
                THEN p.product_notice
                ELSE '[]'::jsonb
              END
            ) AS notice(item)
            WHERE notice.item->>'label' ILIKE ANY($1::text[])
               OR notice.item->>'value' ILIKE ANY($1::text[])
          )
          THEN 90
          ELSE 0
        END
      ) AS relevance_score

    FROM chatbot_products p

    WHERE p.is_active = true
      AND (
        p.goods_name ILIKE ANY($1::text[])
        OR p.detail_info ILIKE ANY($1::text[])
        OR p.short_description ILIKE ANY($1::text[])
        OR p.goods_search_word ILIKE ANY($1::text[])
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(
            CASE
              WHEN jsonb_typeof(p.product_notice) = 'array'
              THEN p.product_notice
              ELSE '[]'::jsonb
            END
          ) AS notice(item)
          WHERE notice.item->>'label' ILIKE ANY($1::text[])
             OR notice.item->>'value' ILIKE ANY($1::text[])
        )
      )

    ORDER BY
      relevance_score DESC,
      p.order_cnt DESC NULLS LAST,
      p.hit_cnt DESC NULLS LAST

    LIMIT 5
    `,
    [patterns]
  );

  return result.rows;
}

// 이전 추천 상품을 현재 DB 정보로 다시 조회
export async function getProductsByGoodsNos(goodsNos) {
  if (!Array.isArray(goodsNos) || goodsNos.length === 0) {
    return [];
  }

  const ids = goodsNos
    .map((no) => Number(no))
    .filter((no) => Number.isSafeInteger(no) && no > 0);

  if (ids.length === 0) {
    return [];
  }

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
      detail_info,
      expiration_dt,
      product_notice
    FROM chatbot_products
    WHERE is_active = true
      AND goods_no::text = ANY($1::text[])
    `,
    [ids.map(String)]
  );

  // 이전 추천 상품의 순서를 유지
  const productMap = new Map(
    result.rows.map((product) => [
      String(product.goods_no),
      product
    ])
  );

  return ids
    .map((no) => productMap.get(String(no)))
    .filter(Boolean);
}
