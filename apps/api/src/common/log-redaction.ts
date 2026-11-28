/** 将 URL 中的邀请/下载 token 替换为占位符，避免进入访问日志。 */
export function redactSensitiveUrl(url: string): string {
  return url
    .replace(/(\/invites\/)[^/?#]+/gi, '$1[redacted]')
    .replace(/([?&](?:token|access_token|refresh_token|code)=)[^&#]*/gi, '$1[redacted]');
}
