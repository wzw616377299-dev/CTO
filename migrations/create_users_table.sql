-- 创建 users 表
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- 添加注释
COMMENT ON TABLE users IS '用户表';
COMMENT ON COLUMN users.id IS '用户 ID';
COMMENT ON COLUMN users.username IS '用户名（唯一）';
COMMENT ON COLUMN users.password IS '密码（bcrypt 哈希）';
COMMENT ON COLUMN users.created_at IS '创建时间';
