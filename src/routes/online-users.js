module.exports = (app, deps) => {
  const { authRequired, adminRequired, pool, sendDbError } = deps;

  // 获取在线用户（基于活跃的 sessions）
  app.get("/api/online-users", authRequired, adminRequired, async (req, res) => {
    try {
      console.log("Calling /api/online-users");
      
      // 从 sessions 表获取当前活跃的会话
      // 只获取未过期的会话，并去重用户
      const [sessions] = await pool.query(
        "SELECT DISTINCT s.user_id, u.username, u.name, u.phone " +
        "FROM sessions s " +
        "JOIN users u ON u.id = s.user_id " +
        "WHERE s.expires_at > NOW()"
      );
      
      console.log("Active sessions found:", sessions ? sessions.length : 0);
      
      // 获取所有用户总数
      const [totalUsersResult] = await pool.query(
        "SELECT COUNT(*) AS total FROM users"
      );
      
      const totalCount = totalUsersResult[0].total || 0;
      const onlineUsers = sessions || [];
      
      console.log("Online users count:", onlineUsers.length);
      console.log("Total users count:", totalCount);
      
      res.json({
        onlineUsers: onlineUsers,
        onlineCount: onlineUsers.length,
        totalCount: totalCount
      });
    } catch (error) {
      console.error("Error in /api/online-users:", error);
      console.error("Error stack:", error.stack);
      
      // 即使出错也返回一个简单的响应
      res.json({
        onlineUsers: [],
        onlineCount: 0,
        totalCount: 0,
        error: error.message
      });
    }
  });
};
