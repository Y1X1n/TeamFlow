import path from 'node:path';

const standalone = process.env.NEXT_OUTPUT_STANDALONE === '1';

const nextConfig = {
  ...(standalone
    ? {
        output: 'standalone',
        outputFileTracingRoot: path.join(import.meta.dirname, '../../'),
      }
    : {}),
  transpilePackages: ['@teamflow/shared'],
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
