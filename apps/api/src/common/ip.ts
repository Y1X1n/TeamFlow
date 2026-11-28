/** 判断请求是否来自本机/私有网段；用于保护仅应由内网抓取的运维端点。 */
export function isPrivateAddress(value: string | undefined): boolean {
  if (!value) return false;
  const address = value.replace(/^::ffff:/i, '');
  if (address === '::1' || address === '127.0.0.1') return true;
  if (address.startsWith('127.')) return true;
  if (address.startsWith('10.') || address.startsWith('192.168.')) return true;
  if (/^(?:fc|fd|fe80)/i.test(address)) return true;
  const match = /^172\.(\d{1,2})\./.exec(address);
  if (match) {
    const second = Number(match[1]);
    return second >= 16 && second <= 31;
  }
  return false;
}
