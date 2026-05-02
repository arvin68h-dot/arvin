export function truncateOutput(output: string, maxLength: number = 4096): string {
  if (output.length <= maxLength) return output;
  return output.slice(0, maxLength) + `\n\n[truncated: ${output.length} chars, show last ${maxLength / 2}...]\n` + output.slice(-maxLength / 2);
}
