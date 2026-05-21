import dotenv from "dotenv";
import axios from "axios";
import pool from "../db/db.js";

dotenv.config();

async function syncProducts() {
  const startedAt = new Date();

  try {
    console.log("상품 동기화 시작");

    const response = await axios.get(
      "https://shopagh.com/api/chatgpt/products",
      {
        headers: {
          "X-CHATBOT-KEY": process.env.CHATBOT_SECRET_KEY
        },
        timeout: 60000
      }
    );

    if (!response.data || response.data.success !== true) {
    console.log("고도몰 API 응답:", response.data);
    throw new Error(response.data?.message || "고도몰 상품 API 응답 실패");
    }

    const items = response.data.items || [];

    console.log(`조회 상품 수: ${items.length}`);

    await pool.query(`
      UPDATE chatbot_products
      SET is_active = false
    `);

    for (const item of items) {
      await pool.query(
        `
        INSERT INTO chatbot_products (
          goods_no,
          goods_name,
          goods_search_word,
          fixed_price,
          goods_price,
          image_url,
          short_description,
          order_cnt,
          hit_cnt,
          source_reg_dt,
          source_mod_dt,
          is_active,
          synced_at,
          detail_info
        )
        VALUES (
          $1,$2,$3,$4,$5,
          $6,$7,$8,$9,
          $10,$11,true,NOW()
        )
        ON CONFLICT (goods_no)
        DO UPDATE SET
          goods_name = EXCLUDED.goods_name,
          goods_search_word = EXCLUDED.goods_search_word,
          fixed_price = EXCLUDED.fixed_price,
          goods_price = EXCLUDED.goods_price,
          image_url = EXCLUDED.image_url,
          short_description = EXCLUDED.short_description,
          order_cnt = EXCLUDED.order_cnt,
          hit_cnt = EXCLUDED.hit_cnt,
          source_reg_dt = EXCLUDED.source_reg_dt,
          source_mod_dt = EXCLUDED.source_mod_dt,
          is_active = true,
          synced_at = NOW(),
          detail_info = EXCLUDED.detail_info
        `,
        [
          item.goodsNo,
          item.goodsNm,
          item.goodsSearchWord || "",
          item.fixedPrice || 0,
          item.goodsPrice || 0,
          item.imageUrl || "",
          item.shortDescription || "",
          item.orderCnt || 0,
          item.hitCnt || 0,
          item.regDt || null,
          item.modDt || null,
          item.detailInfo || ""
        ]
      );
    }

    await pool.query(
      `
      INSERT INTO chatbot_sync_logs (
        sync_type,
        status,
        source_table,
        synced_count,
        message,
        started_at,
        finished_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      `,
      [
        "products",
        "success",
        "es_goods",
        items.length,
        "상품 동기화 완료",
        startedAt
      ]
    );

    console.log("상품 동기화 완료");
  } catch (error) {
    console.error("상품 동기화 실패");
    console.error(error.message);

    await pool.query(
      `
      INSERT INTO chatbot_sync_logs (
        sync_type,
        status,
        source_table,
        synced_count,
        message,
        started_at,
        finished_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      `,
      [
        "products",
        "fail",
        "es_goods",
        0,
        error.message,
        startedAt
      ]
    );
  } finally {
    await pool.end();
  }
}

syncProducts();