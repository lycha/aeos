// Aggregate — Project (id, name, key, path, createdAt)

export interface Project {
  /** Globally unique identifier (crypto.randomUUID()) */
  uuid: string;
  /** Human-readable slug derived from name */
  id: string;
  /** Display name */
  name: string;
  /** 2–4 uppercase letter ticket prefix */
  key: string;
  /** Absolute path to the project root */
  path: string;
  /** ISO-8601 creation timestamp */
  created_at: string;
}
