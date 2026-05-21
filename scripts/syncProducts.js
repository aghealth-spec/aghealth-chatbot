import axios from "axios";
import pool from "../db/db.js";

async function syncProducts() {

  try {

    const response = await axios.get(
      "https://shopagh.com/module/Controller/Front/Api/Chatgpt/products",
      {
        headers: {
          "X-CHATBOT-KEY": process.env.CHATBOT_SECRET_KEY
        }
      }
    );

    const items = response.data.items;

    console.log(`조회 상품 수: ${items.length}`);

    await pool.query(`
      UPDATE chatbot_products
      SET is_active = false
    `);

    for (const item of items) {

      await pool.query(`
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
          synced_at
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
          synced_at = NOW()
      `, [
        item.goodsNo,
        item.goodsNm,
        item.goodsSearchWord,
        item.fixedPrice,
        item.goodsPrice,
        item.imageUrl,
        item.shortDescription,
        item.orderCnt,
        item.hitCnt,
        item.regDt,
        item.modDt
      ]);

    }

    console.log("상품 동기화 완료");

  } catch (error) {

    console.error(error);

  }

}

syncProducts();