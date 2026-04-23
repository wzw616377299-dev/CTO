// Babel 配置：只在本地开发时启用 react-dev-inspector，生产环境（Vercel 等）不加载
const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';

module.exports = {
  presets: [
    [
      'next/babel',
      {
        'preset-react': {
          development: !isProduction,
        },
      },
    ],
  ],
  plugins: isProduction ? [] : ['@react-dev-inspector/babel-plugin'],
};
