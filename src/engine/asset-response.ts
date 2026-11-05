/** Public binary/TeX assets must never admit an HTML error page into engine caches. */
export function isAssetResponse(response: Response): boolean {
  return response.status === 200 && !/text\/html/i.test(response.headers.get('content-type') ?? '')
}
