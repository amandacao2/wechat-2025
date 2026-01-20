/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export', // 替换 standalone 为 export，避免符号链接，适配 Windows 环境
  reactStrictMode: false, // 保留文档中原有的配置
  // 保留文档中原有的代理和跨域 headers 配置
  async rewrites() {
    return [{
      source: '/api/:path*', 
      destination: 'http://localhost:8000/api/:path*', 
    }];
  },
  async headers() {
    return [{
      source: '/api/:path*',
      headers: [
        { key: 'Access-Control-Allow-Origin', value: 'http://localhost:3000' },
        { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,DELETE' },
        { key: 'Access-Control-Allow-Headers', value: 'Content-Type,Authorization' },
      ],
    }];
  },
};

module.exports = nextConfig;