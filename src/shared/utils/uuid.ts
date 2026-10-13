// Wrapper mínimo sobre crypto.randomUUID — evita dependência externa (uuid).
export function uuid(): string {
  return crypto.randomUUID();
}
