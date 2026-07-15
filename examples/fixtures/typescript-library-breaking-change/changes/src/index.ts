interface UserRecord {
  id: string;
  displayName: string | null;
}

export function decodeUser(input: string): UserRecord {
  return JSON.parse(input) as UserRecord;
}
