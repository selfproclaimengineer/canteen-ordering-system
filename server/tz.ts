/**
 * Termux may run Node in UTC. Days, queue numbers and break times are local,
 * so default to WIB unless the host sets TZ itself.
 */
export function pastikanTz(env: NodeJS.ProcessEnv = process.env): string {
  env.TZ ??= 'Asia/Jakarta';
  return env.TZ;
}
