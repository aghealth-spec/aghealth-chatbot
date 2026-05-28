import pool from "../db/db.js";

export async function getChatbotStats() {

  const [
    summary,
    daily,
    chatTypes,
    blocked,
    recentLogs
  ] = await Promise.all([

    pool.query(`
      SELECT
        COUNT(*) AS total_count,
        COUNT(*) FILTER (WHERE chat_type = 'product') AS product_count,
        COUNT(*) FILTER (WHERE chat_type = 'fortune') AS fortune_count,
        COUNT(*) FILTER (WHERE mem_no IS NULL) AS guest_count,
        COUNT(*) FILTER (WHERE mem_no IS NOT NULL) AS member_count
      FROM chatbot_chat_logs
    `),

    pool.query(`
      SELECT
        DATE(created_at) AS date,
        COUNT(*) AS count
      FROM chatbot_chat_logs
      GROUP BY DATE(created_at)
      ORDER BY date ASC
      LIMIT 30
    `),

    pool.query(`
      SELECT
        COALESCE(chat_type, 'product') AS chat_type,
        COUNT(*) AS count
      FROM chatbot_chat_logs
      GROUP BY COALESCE(chat_type, 'product')
    `),

    pool.query(`
      SELECT
        is_blocked,
        COUNT(*) AS count
      FROM chatbot_chat_logs
      GROUP BY is_blocked
    `),

    pool.query(`
      SELECT
        created_at,
        session_id,
        mem_no,
        chat_type,
        user_message,
        bot_answer,
        is_blocked
      FROM chatbot_chat_logs
      ORDER BY created_at DESC
      LIMIT 50
    `)

  ]);

  return {
    summary: summary.rows[0],
    daily: daily.rows,
    chatTypes: chatTypes.rows,
    blocked: blocked.rows,
    recentLogs: recentLogs.rows
  };

}