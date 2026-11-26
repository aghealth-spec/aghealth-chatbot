
import pool from "../db/db.js";

// ========================================
// 상품 검색 제외 단어
// ========================================

const STOP_WORDS = new Set([
  "추천",
  "추천해줘",
  "추천해주세요",
  "해줘",
  "해주세요",
  "좋은",
  "제품",
  "제품들",
  "상품",
  "상품들",
  "영양제",
  "영양제추천",
  "건강기능식품",
  "건기식",
  "알려줘",
  "알려주세요",
  "찾아줘",
  "찾아죠",
  "보여줘",
  "보여주세요",
  "뭐야",
  "어떤",
  "있나요",
  "있어요",
  "주세요",
  "부탁해요",
  "관련",
  "위한",
  "먹는",
  "먹을",
  "필요한",

  // 대상 정보는 검색어가 아닌 별도 조건으로 처리
  "여자",
  "여성",
  "남자",
  "남성",
  "성인",
  "성인용",
  "직장인",
  "어린이",
  "어린이용",
  "키즈",
  "유아",
  "유아용",
  "아동",
  "아이",
  "아기",
  "베이비",
  "초등학생",
  "청소년"
]);

// ========================================
// 상품 정보 요청 표현
// ========================================

const INFO_WORDS = new Set([
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
]);

// ========================================
// 대상별 검색 조건
// ========================================

// 성인 질문에서 제외할 어린이 전용 표시
const CHILD_PRODUCT_PATTERN =
  "(키즈|어린이|유아|영유아|아동|베이비|초등학생|청소년)";

// 어린이 대상 검색 시 사용할 표시
const CHILD_TARGET_PATTERN =
  "(키즈|어린이|유아|영유아|아동|베이비|초등학생|청소년)";

// 여성 질문에서 제외할 남성 전용 표시
const MALE_PRODUCT_PATTERN =
  "(남성용|남자용|맨즈)";

// 남성 질문에서 제외할 여성 전용 표시
const FEMALE_PRODUCT_PATTERN =
  "(여성용|여자용|우먼즈)";

// ========================================
// 고객 대상 분석
// ========================================

function detectAudience(message) {
  const text = String(message || "");

  const isChild =
    /어린이|키즈|유아|영유아|아동|초등학생|청소년|아기|베이비|아이(?:용|들|를|가|에게|는|\s|$)/.test(text);

  const isAdult =
    /성인|직장인|(?:20|30|40|50|60|70|80|90)\s*대|여성|여자|남성|남자/.test(text);

  const isFemale =
    /여성|여자/.test(text);

  const isMale =
    /남성|남자/.test(text);

  return {
    // 성인과 어린이가 함께 등장하면
    // 대상이 혼합된 질문으로 취급합니다.
    adultOnly: isAdult && !isChild,
    childOnly: isChild && !isAdult,
    femaleOnly: isFemale && !isMale,
    maleOnly: isMale && !isFemale
  };
}

// ========================================
// 검색 키워드 추출
// ========================================

function extractKeywords(message) {
  const text = String(message || "")
    .replace(/[^\w가-힣\s]/g, " ");

  return [
    ...new Set(
      text
        .split(/\s+/)
        .map(word => word.trim())
        .filter(word => word.length >= 2)
        .filter(word => !STOP_WORDS.has(word))
        .filter(word => !INFO_WORDS.has(word))

        // 20대, 30대, 40대 등 연령대는
        // 상품 검색어에서 제외
        .filter(word =>
          !/^(?:10|20|30|40|50|60|70|80|90)대(?:여성|남성|여자|남자)?$/.test(word)
        )

        // 상품명이 아닌 일반 정보 요청 표현 제외
        .filter(word =>
          !/^(?:추천|제품|상품|영양제)(?:해줘|해주세요|좀|요)?$/.test(word)
        )
    )
  ].slice(0, 6);
}

// ========================================
// 일반적인 대상별 추천 질문 판단
// ========================================

// 구체적인 성분이나 건강 목표가 없는 경우
// 아무 상품이나 추천하지 않도록 합니다.

export function getSearchClarification(message) {
  const text = String(message || "");
  const audience = detectAudience(text);
  const keywords = extractKeywords(text);

  const isRecommendation =
    /추천|골라|찾아/.test(text);

  const isGeneralSupplementQuestion =
    /영양제|건강기능식품|건기식|제품|상품/.test(text);

  if (
    isRecommendation &&
    isGeneralSupplementQuestion &&
    keywords.length === 0
  ) {
    if (audience.adultOnly) {
      return (
        "연령대와 성별만으로 필요한 영양제를 정하기는 어렵습니다.\n\n" +
        "어떤 부분에 관심이 있으신가요?\n\n" +
        "💊 종합비타민·영양 보충\n" +
        "👀 눈 건강\n" +
        "🦴 뼈 건강\n" +
        "🌿 장 건강\n\n" +
        "관심 있는 분야를 알려주시면 해당 기준에 맞는 상품정보를 확인해 드리겠습니다."
      );
    }

    if (audience.childOnly) {
      return (
        "어린이 영양제는 연령과 섭취 목적을 먼저 확인하는 것이 좋습니다.\n\n" +
        "아이의 나이와 관심 있는 건강 분야를 알려주세요.\n" +
        "해당 조건에 맞는 상품정보를 확인해 드리겠습니다."
      );
    }

    return (
      "어떤 건강 분야의 영양제를 찾으시나요?\n\n" +
      "종합비타민, 눈 건강, 뼈 건강, 장 건강 등 " +
      "관심 있는 분야를 알려주시면 관련 상품을 찾아드리겠습니다."
    );
  }

  return null;
}

// ========================================
// PostgreSQL ILIKE 특수문자 처리
// ========================================

function escapeLikePattern(value) {
  return String(value)
    .replace(/[\\%_]/g, "\\$&");
}

// ========================================
// 상품 검색
// ========================================

export async function searchProducts(message) {
  const keywords = extractKeywords(message);
  const audience = detectAudience(message);

  console.log("[PRODUCT SEARCH INPUT]", {
    message,
    keywords,
    audience
  });

  // 실제 상품 검색어가 없다면
  // 관련 없는 제품을 임의로 검색하지 않음
  if (keywords.length === 0) {
    console.log("[PRODUCT SEARCH SKIPPED]", {
      reason: "NO_SPECIFIC_PRODUCT_KEYWORDS",
      message
    });

    return [];
  }

  // 검색 단어별 부분 일치 패턴
  const patterns = keywords.map(
    keyword =>
      `%${escapeLikePattern(keyword)}%`
  );

  // 전체 검색 구문
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

      -- ========================================
      -- 1. 상품명 전체 구문 일치
      -- ========================================

      CASE
        WHEN COALESCE(p.goods_name, '') ILIKE $2
        THEN 1
        ELSE 0
      END AS name_phrase_match,

      -- ========================================
      -- 2. 상품명에 모든 키워드 포함
      -- ========================================

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

      -- ========================================
      -- 3. 상품명 키워드 일치 개수
      -- ========================================

      (
        SELECT COUNT(*)
        FROM unnest($1::text[]) AS search_term(pattern)
        WHERE COALESCE(p.goods_name, '')
              ILIKE search_term.pattern
      ) AS name_keyword_count,

      -- ========================================
      -- 4. 검색 관련성 점수
      -- 상품명 > 검색어 > 상세설명
      -- ========================================

      (
        CASE
          WHEN COALESCE(p.goods_name, '')
               ILIKE ANY($1::text[])
          THEN 150
          ELSE 0
        END

        +

        CASE
          WHEN COALESCE(p.goods_search_word, '')
               ILIKE ANY($1::text[])
          THEN 80
          ELSE 0
        END

        +

        CASE
          WHEN COALESCE(p.short_description, '')
               ILIKE ANY($1::text[])
          THEN 40
          ELSE 0
        END

        +

        CASE
          WHEN COALESCE(p.detail_info, '')
               ILIKE ANY($1::text[])
          THEN 25
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
            WHERE COALESCE(notice.item->>'value', '')
                  ILIKE ANY($1::text[])
          )
          THEN 15
          ELSE 0
        END
      ) AS relevance_score

    FROM chatbot_products p

    WHERE p.is_active = true

      -- ========================================
      -- 성인 대상 질문
      -- 어린이 전용 표시 제품 제외
      -- ========================================

      AND (
        $3::boolean = false
        OR COALESCE(p.goods_name, '')
           !~* $7::text
      )

      -- ========================================
      -- 어린이 대상 질문
      -- 어린이용으로 식별되는 상품만 검색
      -- ========================================

      AND (
        $4::boolean = false
        OR COALESCE(p.goods_name, '')
           ~* $8::text
      )

      -- ========================================
      -- 여성 대상 질문
      -- 남성 전용 표시 제품 제외
      -- ========================================

      AND (
        $5::boolean = false
        OR COALESCE(p.goods_name, '')
           !~* $9::text
      )

      -- ========================================
      -- 남성 대상 질문
      -- 여성 전용 표시 제품 제외
      -- ========================================

      AND (
        $6::boolean = false
        OR COALESCE(p.goods_name, '')
           !~* $10::text
      )

      -- ========================================
      -- 실제 상품 관련 키워드 검색
      -- ========================================

      AND (
        COALESCE(p.goods_name, '')
        ILIKE ANY($1::text[])

        OR COALESCE(p.goods_search_word, '')
        ILIKE ANY($1::text[])

        OR COALESCE(p.short_description, '')
        ILIKE ANY($1::text[])

        OR COALESCE(p.detail_info, '')
        ILIKE ANY($1::text[])

        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(
            CASE
              WHEN jsonb_typeof(p.product_notice) = 'array'
              THEN p.product_notice
              ELSE '[]'::jsonb
            END
          ) AS notice(item)
          WHERE COALESCE(notice.item->>'value', '')
                ILIKE ANY($1::text[])
        )
      )

    ORDER BY

      -- 1순위: 상품명 전체 문구 일치
      name_phrase_match DESC,

      -- 2순위: 상품명 모든 키워드 일치
      name_all_keywords_match DESC,

      -- 3순위: 상품명 키워드 일치 개수
      name_keyword_count DESC,

      -- 4순위: 전체 관련성 점수
      relevance_score DESC,

      -- 5순위: 주문량
      p.order_cnt DESC NULLS LAST,

      -- 6순위: 조회수
      p.hit_cnt DESC NULLS LAST,

      -- 마지막 순서 고정
      p.goods_no ASC

    LIMIT 5
    `,
    [
      patterns,
      phrasePattern,
      audience.adultOnly,
      audience.childOnly,
      audience.femaleOnly,
      audience.maleOnly,
      CHILD_PRODUCT_PATTERN,
      CHILD_TARGET_PATTERN,
      MALE_PRODUCT_PATTERN,
      FEMALE_PRODUCT_PATTERN
    ]
  );

  console.log("[PRODUCT SEARCH RANKING]", {
    query: message,
    keywords,
    audience,
    products: result.rows.map(p => ({
      goodsNo: String(p.goods_no),
      goodsName: p.goods_name,
      phraseMatch: p.name_phrase_match,
      allKeywordsMatch: p.name_all_keywords_match,
      keywordCount: Number(p.name_keyword_count),
      relevanceScore: p.relevance_score
    }))
  });

  return result.rows;
}

// ========================================
// 기존 추천 상품번호 재조회
// 기존 기능 유지
// ========================================

export async function getProductsByGoodsNos(goodsNos) {
  if (
    !Array.isArray(goodsNos) ||
    goodsNos.length === 0
  ) {
    return [];
  }

  const ids = [
    ...new Set(
      goodsNos
        .map(no => Number(no))
        .filter(no =>
          Number.isSafeInteger(no) &&
          no > 0
        )
    )
  ].slice(0, 20);

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

  // 기존 상품번호 순서 유지
  const productMap = new Map(
    result.rows.map(product => [
      String(product.goods_no),
      product
    ])
  );

  return ids
    .map(no =>
      productMap.get(String(no))
    )
    .filter(Boolean);
}
