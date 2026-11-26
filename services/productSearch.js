
import pool from "../db/db.js";

// ========================================
// 상품 검색 제외 단어
// ========================================

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

// ========================================
// 상품 정보 요청 표현
// ========================================

const INFO_WORDS = [
  "섭취량",
  "섭취방법",
  "복용법",
  "복용방법",
  "영양정보",
  "주의사항",
  "보관방법",
  "보관법",
  "기능정보",
  "성분",
  "함량",
  "가격",
  "소비기한",
  "유통기한"
];

// ========================================
// 검색 키워드 추출
// ========================================

function extractKeywords(message) {
  return String(message || "")
    .replace(/[^\w가-힣\s]/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 2)
    .filter((word) => !STOP_WORDS.includes(word))
    .filter((word) => !INFO_WORDS.includes(word));
}

// ========================================
// PostgreSQL ILIKE 특수문자 처리
// ========================================

function escapeLikePattern(value) {
  return String(value).replace(/[\\%_]/g, "\\$&");
}

// ========================================
// 상품 검색
// ========================================

export async function searchProducts(message) {
  const keywords = extractKeywords(message);

  if (keywords.length === 0) {
    return [];
  }

  // 검색 단어별 부분 일치 패턴
  // 예: ["액상", "마그네슘"]
  const patterns = keywords.map(
    (keyword) => `%${escapeLikePattern(keyword)}%`
  );

  // 전체 검색어 연속 일치 패턴
  // 예: "%액상 마그네슘%"
  const phrasePattern =
    `%${escapeLikePattern(keywords.join(" "))}%`;

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

      -- 상품명이 전체 검색 구문과 일치하는지
      CASE
        WHEN COALESCE(p.goods_name, '') ILIKE $2
        THEN 1
        ELSE 0
      END AS name_phrase_match,

      -- 모든 검색 단어가 상품명에 포함되는지
      CASE
        WHEN NOT EXISTS (
          SELECT 1
          FROM unnest($1::text[]) AS search_term(pattern)
          WHERE COALESCE(p.goods_name, '')
                NOT ILIKE search_term.pattern
        )
        THEN 1
        ELSE 0
      END AS name_all_keywords_match,

      -- 기존 검색 점수 유지
      (
        CASE
          WHEN p.goods_name ILIKE ANY($1::text[])
          THEN 10
          ELSE 0
        END
        +
        CASE
          WHEN p.detail_info ILIKE ANY($1::text[])
          THEN 100
          ELSE 0
        END
        +
        CASE
          WHEN p.short_description ILIKE ANY($1::text[])
          THEN 70
          ELSE 0
        END
        +
        CASE
          WHEN p.goods_search_word ILIKE ANY($1::text[])
          THEN 80
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
            WHERE notice.item->>'value'
                  ILIKE ANY($1::text[])
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
          WHERE notice.item->>'value'
                ILIKE ANY($1::text[])
        )
      )

    ORDER BY
      -- 1순위: 전체 검색 구문이 상품명에 포함
      name_phrase_match DESC,

      -- 2순위: 검색 단어가 모두 상품명에 포함
      name_all_keywords_match DESC,

      -- 3순위: 기존 검색 관련성 점수
      relevance_score DESC,

      -- 4순위: 주문량
      p.order_cnt DESC NULLS LAST,

      -- 5순위: 조회수
      p.hit_cnt DESC NULLS LAST,

      -- 동일 점수일 때 결과 순서 안정화
      p.goods_no ASC

    LIMIT 5
    `,
    [patterns, phrasePattern]
  );

  console.log("[PRODUCT SEARCH RANKING]", {
    query: message,
    keywords,
    products: result.rows.map((p) => ({
      goodsNo: String(p.goods_no),
      goodsName: p.goods_name,
      phraseMatch: p.name_phrase_match,
      allKeywordsMatch: p.name_all_keywords_match,
      relevanceScore: p.relevance_score
    }))
  });

  return result.rows;
}

// ========================================
// 이전 추천 상품을 DB에서 다시 조회
// ========================================

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