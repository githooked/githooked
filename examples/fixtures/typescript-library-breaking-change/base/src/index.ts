export interface User {
  id: string;
  displayName: string;
}

export function parseUser(input: string): User {
  return JSON.parse(input) as User;
}
