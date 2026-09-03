export function retryExtensions(format: number): string[];
export function bloomCandidates(format: number, reqname: string): string[];
export function fetchCandidates(
  format: number,
  reqname: string,
  mayExist: ((key: string) => boolean) | null,
): string[];
